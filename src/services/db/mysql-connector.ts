import mysql, { Connection, RowDataPacket } from 'mysql2/promise';
import { IDatabaseConnector, IConnectorConfig, ICollectOptions } from './connector.js';
import { ISQLQueryRecord, IExecutionPlan, ICatalogInfo, IIndexInfo } from '../data/types.js';
import { ExplainParser } from '../ml/engine/explain-parser.js';

/**
 * MySQL/MariaDB connector implementation.
 *
 * Uses mysql2/promise for async connection management.
 * Leverages the existing ExplainParser to transform EXPLAIN results
 * into IExecutionPlan objects compatible with the ML pipeline.
 */
export class MysqlConnector implements IDatabaseConnector {
  readonly engine: string;
  readonly database: string;
  private connection: Connection | null = null;
  private config: IConnectorConfig;
  private explainParser: ExplainParser;

  constructor(config: IConnectorConfig) {
    this.engine = config.engine;
    this.database = config.database;
    this.config = config;
    this.explainParser = new ExplainParser();
  }

  async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    try {
      this.connection = await mysql.createConnection({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        ssl: this.config.ssl ? {} : undefined,
        connectTimeout: this.config.connectTimeout ?? 5000,
      });

      console.log(`[MysqlConnector] Connected to ${this.config.host}:${this.config.port}/${this.config.database}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[MysqlConnector] Connection failed: ${message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.end();
        console.log('[MysqlConnector] Disconnected');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[MysqlConnector] Error during disconnect: ${message}`);
      } finally {
        this.connection = null;
      }
    }
  }

  isConnected(): boolean {
    return this.connection !== null;
  }

  async explain(query: string): Promise<IExecutionPlan[]> {
    this.ensureConnected();

    try {
      const [rows] = await this.connection!.query<RowDataPacket[]>(`EXPLAIN ${query}`);
      return rows.map(row => this.explainParser.parse(row as Record<string, unknown>));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[MysqlConnector] EXPLAIN failed: ${message}`);
      return [];
    }
  }

  async getCatalogInfo(database: string, table: string): Promise<ICatalogInfo> {
    this.ensureConnected();

    const [tableRows] = await this.connection!.query<RowDataPacket[]>(
      `SELECT TABLE_ROWS, AVG_ROW_LENGTH
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [database, table]
    );

    const rowCount = tableRows.length > 0 ? Number(tableRows[0].TABLE_ROWS) || 0 : 0;
    const avgRowLength = tableRows.length > 0 ? Number(tableRows[0].AVG_ROW_LENGTH) || 0 : 0;

    const [indexRows] = await this.connection!.query<RowDataPacket[]>(
      `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE, SEQ_IN_INDEX
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [database, table]
    );

    const indexMap = new Map<string, { columns: string[]; isUnique: boolean }>();
    for (const row of indexRows) {
      const name = String(row.INDEX_NAME);
      if (!indexMap.has(name)) {
        indexMap.set(name, {
          columns: [],
          isUnique: Number(row.NON_UNIQUE) === 0,
        });
      }
      indexMap.get(name)!.columns.push(String(row.COLUMN_NAME));
    }

    const indexes: IIndexInfo[] = [];
    for (const [name, info] of indexMap) {
      indexes.push({
        name,
        columns: info.columns,
        isUnique: info.isUnique,
      });
    }

    return {
      database,
      table,
      rowCount,
      avgRowLength,
      indexes,
    };
  }

  async getTablesInDatabase(database: string): Promise<string[]> {
    this.ensureConnected();

    const [rows] = await this.connection!.query<RowDataPacket[]>(
      `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
      [database]
    );

    return rows.map(row => String(row.TABLE_NAME));
  }

  async collectRecentQueries(options: ICollectOptions): Promise<ISQLQueryRecord[]> {
    this.ensureConnected();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.database) {
      conditions.push('SCHEMA_NAME = ?');
      params.push(options.database);
    }

    if (options.minExecutionTimeMs !== undefined) {
      // performance_schema stores time in picoseconds (ps)
      conditions.push('SUM_TIMER_WAIT / 1000000000 >= ?');
      params.push(options.minExecutionTimeMs);
    }

    if (options.since) {
      conditions.push('LAST_SEEN >= ?');
      params.push(options.since.toISOString().slice(0, 19).replace('T', ' '));
    }

    // Filter out internal queries and NULL digests
    conditions.push('DIGEST_TEXT IS NOT NULL');
    conditions.push('SCHEMA_NAME IS NOT NULL');

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = options.limit ? `LIMIT ${Number(options.limit)}` : 'LIMIT 100';

    const query = `
      SELECT
        DIGEST AS id,
        DIGEST_TEXT AS query,
        ROUND(SUM_TIMER_WAIT / 1000000000, 2) AS executionTimeMs,
        SCHEMA_NAME AS \`database\`,
        LAST_SEEN AS timestamp
      FROM performance_schema.events_statements_summary_by_digest
      ${whereClause}
      ORDER BY SUM_TIMER_WAIT DESC
      ${limitClause}
    `;

    try {
      const [rows] = await this.connection!.query<RowDataPacket[]>(query, params);

      return rows.map(row => ({
        id: `q_${String(row.id).substring(0, 16)}_${Date.now()}`,
        query: String(row.query),
        executionTimeMs: Number(row.executionTimeMs) || 0,
        database: String(row.database),
        timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : new Date().toISOString(),
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[MysqlConnector] Failed to collect queries from performance_schema: ${message}`);
      console.error('[MysqlConnector] Ensure the user has SELECT privilege on performance_schema.');
      return [];
    }
  }

  /**
   * Ensures a connection is active. Throws if not connected.
   */
  private ensureConnected(): void {
    if (!this.connection) {
      throw new Error('[MysqlConnector] Not connected. Call connect() first.');
    }
  }
}
