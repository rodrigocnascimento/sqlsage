import { ICatalogInfo, IIndexInfo } from '../../data/types.js';
import { IDatabaseConnector } from '../../db/connector.js';

export interface ICatalogConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database: string;
}

export class CatalogGatherer {
  private config: ICatalogConfig | null = null;
  private connector: IDatabaseConnector | null = null;

  setConfig(config: ICatalogConfig): void {
    this.config = config;
  }

  /**
   * Attach a live database connector.
   * When set, gather() and related methods will query the real database
   * instead of returning mock data.
   */
  setConnector(connector: IDatabaseConnector | null): void {
    this.connector = connector;
  }

  /**
   * Gather catalog info for a table (or all known tables in a database).
   * Uses the live connector if available, otherwise falls back to mock data.
   */
  async gather(database: string, tableName?: string): Promise<ICatalogInfo[]> {
    // Live mode: use the real connector
    if (this.connector) {
      return this.gatherLive(database, tableName);
    }

    // Mock mode: return hardcoded data
    return this.gatherMock(database, tableName);
  }

  /**
   * Synchronous mock-only gather (backward compatible for existing callers).
   */
  gatherMock(database: string, tableName?: string): ICatalogInfo[] {
    const results: ICatalogInfo[] = [];

    if (tableName) {
      results.push(this.createMockCatalogInfo(database, tableName));
    } else {
      results.push(this.createMockCatalogInfo(database, 'users'));
      results.push(this.createMockCatalogInfo(database, 'orders'));
      results.push(this.createMockCatalogInfo(database, 'products'));
    }

    return results;
  }

  /**
   * Gather catalog info from a live database connection.
   */
  private async gatherLive(database: string, tableName?: string): Promise<ICatalogInfo[]> {
    if (!this.connector) {
      return this.gatherMock(database, tableName);
    }

    try {
      if (tableName) {
        const info = await this.connector.getCatalogInfo(database, tableName);
        return [info];
      }

      // Get all tables and gather catalog info for each
      const tables = await this.connector.getTablesInDatabase(database);
      const results: ICatalogInfo[] = [];

      for (const table of tables) {
        const info = await this.connector.getCatalogInfo(database, table);
        results.push(info);
      }

      return results;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[CatalogGatherer] Live catalog failed, falling back to mock: ${msg}`);
      return this.gatherMock(database, tableName);
    }
  }

  private createMockCatalogInfo(database: string, table: string): ICatalogInfo {
    const indexes: IIndexInfo[] = [
      { name: `${table}_id_pk`, columns: ['id'], isUnique: true },
    ];

    if (table === 'orders') {
      indexes.push({ name: `${table}_user_id_idx`, columns: ['user_id'], isUnique: false });
      indexes.push({ name: `${table}_created_idx`, columns: ['created_at'], isUnique: false });
    } else if (table === 'products') {
      indexes.push({ name: `${table}_category_idx`, columns: ['category_id'], isUnique: false });
    }

    const rowCounts: Record<string, number> = {
      users: 10000,
      orders: 50000,
      products: 5000,
    };

    return {
      database,
      table,
      rowCount: rowCounts[table] || 1000,
      avgRowLength: Math.floor(Math.random() * 200) + 50,
      indexes,
    };
  }

  /**
   * Get indexes for a specific table.
   * Uses live connector if available, otherwise mock.
   */
  async getIndexesForTable(database: string, table: string): Promise<IIndexInfo[]> {
    const catalog = await this.gather(database, table);
    return catalog[0]?.indexes || [];
  }

  /**
   * Check if a column is indexed in a specific table.
   * Uses live connector if available, otherwise mock.
   */
  async isColumnIndexed(database: string, table: string, column: string): Promise<boolean> {
    const indexes = await this.getIndexesForTable(database, table);
    return indexes.some(idx => idx.columns.includes(column));
  }
}
