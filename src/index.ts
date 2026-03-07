import { Command } from 'commander';
import { readFileSync } from 'fs';
import { MLPredictionService } from './services/ml-prediction.service.js';
import { createCollectCommand } from './services/data/query-collector.js';
import { createFeaturesCommand } from './services/data/features-command.js';
import { createTrainCommand } from './services/data/train-command.js';
import { resolveConnectionConfig, ICLIConnectionOptions } from './services/config/connection-config.js';
import { createConnector, IDatabaseConnector } from './services/db/connector.js';

const program = new Command();

program
  .name('sql-ml')
  .description('CLI tool to analyze SQL files using ML-based query performance prediction')
  .version('0.5.0')
  .option('--host <host>', 'Database host')
  .option('--port <port>', 'Database port')
  .option('--user <user>', 'Database user')
  .option('--password <password>', 'Database password')
  .option('--database <name>', 'Database name')
  .option('--engine <engine>', 'Database engine (mysql, mariadb, postgresql, sqlite)')
  .option('--ssl', 'Enable SSL connection');

/**
 * Helper: resolve global DB options from the parent program.
 */
function getGlobalDbOptions(): ICLIConnectionOptions {
  const opts = program.opts();
  return {
    host: opts.host,
    port: opts.port,
    user: opts.user,
    password: opts.password,
    database: opts.database,
    engine: opts.engine,
    ssl: opts.ssl,
  };
}

/**
 * Helper: create and connect a database connector from global options.
 * Returns null if no database is configured (offline mode).
 */
async function resolveConnector(): Promise<IDatabaseConnector | null> {
  const cliOpts = getGlobalDbOptions();
  const config = resolveConnectionConfig(cliOpts);

  if (!config) {
    return null;
  }

  const connector = createConnector(config);
  await connector.connect();
  return connector;
}

program.addCommand(createCollectCommand(resolveConnector));
program.addCommand(createFeaturesCommand());
program.addCommand(createTrainCommand());

program
  .command('analyze')
  .description('Analyze a SQL file and return performance predictions')
  .argument('<file>', 'Path to the SQL file to analyze')
  .option('-o, --output <file>', 'Output file for JSON results (stdout if not specified)')
  .option('-m, --model <dir>', 'Model directory to load trained weights from', 'models')
  .option('-v, --verbose', 'Verbose output')
  .action(async (file: string, options: { output?: string; model?: string; verbose?: boolean }) => {
    let connector: IDatabaseConnector | null = null;

    try {
      // Resolve optional DB connector
      connector = await resolveConnector();

      if (connector) {
        console.log(`[Analyze] Connected to ${connector.engine} database`);
      }

      console.log('Initializing ML Engine...');
      const service = new MLPredictionService();
      await service.initialize(options.model);

      if (options.verbose) {
        const status = await service.getStatus();
        console.log('[Status]', JSON.stringify(status, null, 2));
      }

      console.log(`Reading SQL file: ${file}`);
      const sql = readFileSync(file, 'utf-8');

      console.log('Analyzing SQL...');
      const result = await service.predict({ sql }, connector ?? undefined);

      const output = JSON.stringify(result, null, 2);

      if (options.output) {
        const { writeFileSync } = await import('fs');
        writeFileSync(options.output, output);
        console.log(`Results written to: ${options.output}`);
      } else {
        console.log(output);
      }

      console.log('\nSummary:');
      console.log(`  Performance Score: ${(result.performanceScore * 100).toFixed(1)}%`);
      console.log(`  ML Model: ${result.mlAvailable ? 'loaded' : 'not available (heuristics only)'}`);
      console.log(`  Database: ${connector ? `connected (${connector.engine})` : 'offline (no live EXPLAIN)'}`);
      console.log(`  Issues Found: ${result.insights.length}`);

      if (result.insights.length > 0) {
        console.log('\n  Issues:');
        for (const insight of result.insights) {
          console.log(`    [${insight.issueType}] ${insight.educationalFix}`);
        }
      }

    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      if (connector) {
        await connector.disconnect();
      }
    }
  });

program
  .command('status')
  .description('Show ML engine status and database connection info')
  .option('-m, --model <dir>', 'Model directory', 'models')
  .action(async (options: { model?: string }) => {
    let connector: IDatabaseConnector | null = null;

    try {
      const service = new MLPredictionService();
      await service.initialize(options.model);
      const mlStatus = await service.getStatus();

      // Attempt DB connection
      connector = await resolveConnector();

      const dbStatus: Record<string, unknown> = connector
        ? {
          connected: true,
          engine: connector.engine,
        }
        : { connected: false };

      // If connected, get table list
      if (connector) {
        const dbOpts = getGlobalDbOptions();
        const dbName = dbOpts.database || process.env.SQLML_DATABASE || '';
        if (dbName) {
          const tables = await connector.getTablesInDatabase(dbName);
          (dbStatus as Record<string, unknown>).tables = tables;
          (dbStatus as Record<string, unknown>).tableCount = tables.length;
        }
      }

      console.log(JSON.stringify({ ml: mlStatus, database: dbStatus }, null, 2));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      if (connector) {
        await connector.disconnect();
      }
    }
  });

program.parse();
