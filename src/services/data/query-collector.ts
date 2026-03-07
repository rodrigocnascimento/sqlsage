import { Command } from 'commander';
import { SlowLogParser } from './slow-log-parser.js';
import { DatasetStorage } from './storage.js';
import { ISQLQueryRecord } from './types.js';
import { IDatabaseConnector } from '../db/connector.js';

/**
 * Factory type for lazy connector resolution.
 * The connector is created on demand only when --source db is used.
 */
type ConnectorResolver = () => Promise<IDatabaseConnector | null>;

export function createCollectCommand(resolveConnector?: ConnectorResolver): Command {
  const command = new Command('collect');

  command
    .description('Collect SQL queries from various sources')
    .option('-i, --input <path>', 'Input file (slow query log)')
    .option('-o, --output <path>', 'Output file path', 'data/queries.jsonl')
    .option('-q, --query <sql>', 'Single query to add')
    .option('-t, --time <ms>', 'Execution time in milliseconds', '0')
    .option('-d, --database <name>', 'Database name', 'default')
    .option('-s, --source <source>', 'Source type: file (default) or db', 'file')
    .option('--min-time <ms>', 'Minimum execution time filter for DB collection (ms)', '0')
    .option('--limit <n>', 'Maximum number of queries to collect from DB', '100')
    .option('--timestamp <iso>', 'Timestamp (ISO format)', new Date().toISOString());

  command.action(async (options) => {
    const storage = new DatasetStorage(options.output);
    let collected = false;

    // Source: database (performance_schema)
    if (options.source === 'db') {
      if (!resolveConnector) {
        console.error('[Collect] Error: Database connector not available. Provide global --database, --user, --password flags.');
        process.exit(1);
      }

      let connector: IDatabaseConnector | null = null;
      try {
        connector = await resolveConnector();

        if (!connector) {
          console.error('[Collect] Error: No database configured. Provide --database, --user, --password flags or set SQLML_* environment variables.');
          process.exit(1);
        }

        console.log(`[Collect] Collecting queries from ${connector.engine} performance_schema...`);

        const records = await connector.collectRecentQueries({
          database: options.database !== 'default' ? options.database : undefined,
          minExecutionTimeMs: parseInt(options.minTime, 10) || undefined,
          limit: parseInt(options.limit, 10) || 100,
        });

        if (records.length === 0) {
          console.log('[Collect] No queries found matching the criteria.');
        } else {
          storage.appendRecords(records);
          console.log(`[Collect] Added ${records.length} queries from database to ${options.output}`);
        }

        collected = true;
      } finally {
        if (connector) {
          await connector.disconnect();
        }
      }
    }

    // Source: slow query log file
    if (options.input) {
      console.log(`[Collect] Parsing slow query log: ${options.input}`);
      const parser = new SlowLogParser();
      const records = parser.parse(options.input);
      storage.appendRecords(records);
      console.log(`[Collect] Added ${records.length} queries to ${options.output}`);
      collected = true;
    }

    // Source: single inline query
    if (options.query) {
      const record: ISQLQueryRecord = {
        id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        query: options.query,
        executionTimeMs: parseInt(options.time, 10),
        database: options.database,
        timestamp: options.timestamp,
      };
      storage.appendRecord(record);
      console.log(`[Collect] Added query: ${options.query.substring(0, 50)}...`);
      collected = true;
    }

    if (!collected) {
      console.error('[Collect] Error: Specify --source db, --input <file>, or --query <sql>');
      process.exit(1);
    }
  });

  return command;
}
