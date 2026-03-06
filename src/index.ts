import { Command } from 'commander';
import { readFileSync } from 'fs';
import { MLPredictionService } from './services/ml-prediction.service';
import { createCollectCommand } from './services/data/query-collector';
import { createFeaturesCommand } from './services/data/features-command';
import { createTrainCommand } from './services/data/train-command';

const program = new Command();

program
  .name('sql-ml')
  .description('CLI tool to analyze SQL files using ML-based query performance prediction')
  .version('0.3.0');

program.addCommand(createCollectCommand());
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
    try {
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
      console.log(`  ML Model: ${result.mlAvailable ? 'loaded' : 'not available (heuristics only)'}`);
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
    }
  });

program
  .command('status')
  .description('Show ML engine status')
  .option('-m, --model <dir>', 'Model directory', 'models')
  .action(async (options: { model?: string }) => {
    try {
      const service = new MLPredictionService();
      await service.initialize(options.model);
      const status = await service.getStatus();
      console.log(JSON.stringify(status, null, 2));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
