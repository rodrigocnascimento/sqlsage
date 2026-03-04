import { Command } from 'commander';
import { readFileSync } from 'fs';
import { MLPredictionService } from './services/ml-prediction.service.js';

const program = new Command();

program
  .name('sql-ml')
  .description('CLI tool to analyze SQL files using ML-based query performance prediction')
  .version('1.0.0');

program
  .command('analyze')
  .description('Analyze a SQL file and return performance predictions')
  .argument('<file>', 'Path to the SQL file to analyze')
  .option('-o, --output <file>', 'Output file for JSON results (stdout if not specified)')
  .option('-v, --verbose', 'Verbose output')
  .action(async (file: string, options: { output?: string; verbose?: boolean }) => {
    try {
      console.log('Initializing ML Engine...');
      const service = new MLPredictionService();
      await service.initialize();

      if (options.verbose) {
        const status = await service.getStatus();
        console.log('[Status]', status);
      }

      console.log(`Reading SQL file: ${file}`);
      const sql = readFileSync(file, 'utf-8');

      console.log('Analyzing SQL...');
      const result = await service.predict({ sql });

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
      console.log(`  Insights Found: ${result.insights.length}`);
      
      if (result.features.hasCartesianRisk) {
        console.log('  ⚠️  Cartesian product risk detected');
      }
      if (result.features.fullTableScanRisk) {
        console.log('  ⚠️  Full table scan risk detected');
      }
      if (result.features.missingIndexCount > 0) {
        console.log(`  ⚠️  ${result.features.missingIndexCount} potential missing indexes`);
      }

    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show ML engine status')
  .action(async () => {
    try {
      const service = new MLPredictionService();
      await service.initialize();
      const status = await service.getStatus();
      console.log(JSON.stringify(status, null, 2));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
