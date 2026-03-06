import { Command } from 'commander';
import { ModelTrainer, ITrainingConfig } from '../ml/train';

export function createTrainCommand(): Command {
  const command = new Command('train');

  command
    .description('Train the ML model with collected query data')
    .option('-i, --input <path>', 'Input features file', 'data/features.jsonl')
    .option('-o, --output <path>', 'Output model directory', 'models')
    .option('-e, --epochs <number>', 'Number of training epochs', '50')
    .option('-b, --batch-size <number>', 'Batch size', '32')
    .option('-v, --validation-split <number>', 'Validation split (0-1)', '0.2')
    .option('-l, --learning-rate <number>', 'Learning rate', '0.001')
    .option('-s, --slow-threshold <number>', 'Execution time (ms) above which query is labeled slow', '500')
    .action(async (options) => {
      console.log('[Train] Starting model training...');

      const config: ITrainingConfig = {
        epochs: parseInt(options.epochs, 10),
        batchSize: parseInt(options.batchSize, 10),
        validationSplit: parseFloat(options.validationSplit),
        learningRate: parseFloat(options.learningRate),
        slowThreshold: parseInt(options.slowThreshold, 10),
      };

      console.log('[Train] Configuration:');
      console.log(`  Epochs: ${config.epochs}`);
      console.log(`  Batch size: ${config.batchSize}`);
      console.log(`  Validation split: ${config.validationSplit}`);
      console.log(`  Learning rate: ${config.learningRate}`);
      console.log(`  Slow threshold: ${config.slowThreshold}ms`);

      const trainer = new ModelTrainer();

      try {
        const result = await trainer.train(options.input, options.output, config);

        console.log('\n[Train] Training completed!');
        console.log(`  Model version: ${result.modelVersion}`);
        console.log(`  Final loss: ${result.finalLoss.toFixed(4)}`);
        console.log(`  Final accuracy: ${(result.finalAccuracy * 100).toFixed(2)}%`);
        console.log(`  Training samples: ${result.trainSamples}`);
        console.log(`  Validation samples: ${result.valSamples}`);
        console.log(`  Slow threshold: ${result.slowThreshold}ms`);
        console.log(`  Model saved to: ${options.output}/`);
      } catch (error) {
        console.error('[Train] Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  return command;
}
