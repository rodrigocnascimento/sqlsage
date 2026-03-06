import * as tf from '@tensorflow/tfjs';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { tokenizeQuery, VOCAB_SIZE, SEQ_LEN } from './engine/tokenizer';
import { QueryPerformancePredictor } from './engine/model';

export interface ITrainingConfig {
  epochs: number;
  batchSize: number;
  validationSplit: number;
  learningRate: number;
  slowThreshold: number;
}

export interface ITrainingResult {
  modelVersion: string;
  epochs: number;
  finalLoss: number;
  finalAccuracy: number;
  trainSamples: number;
  valSamples: number;
  slowThreshold: number;
  metrics: {
    loss: number[];
    valLoss: number[];
    accuracy: number[];
    valAccuracy: number[];
  };
}

export interface IFeatureRecord {
  query: string;
  executionTimeMs: number;
  database: string;
  timestamp: string;
  features: Record<string, number>;
}

const META_FEATURES = 18;

const FEATURE_KEYS = [
  'hasJoin', 'joinCount', 'hasSubquery', 'subqueryCount', 'hasFunctionInWhere',
  'selectStar', 'tableCount', 'whereColumnsIndexed', 'estimatedRows', 'hasOr',
  'hasUnion', 'hasLike', 'hasCountStar', 'nestedJoinDepth', 'hasGroupBy',
  'hasOrderBy', 'hasLimit', 'orConditionCount',
];

export class ModelTrainer {
  private predictor: QueryPerformancePredictor | null = null;

  async train(
    inputPath: string,
    outputDir: string,
    config: ITrainingConfig = { epochs: 50, batchSize: 32, validationSplit: 0.2, learningRate: 0.001, slowThreshold: 500 }
  ): Promise<ITrainingResult> {
    console.log('[Train] Loading dataset...');
    const records = this.loadDataset(inputPath);

    if (records.length < 10) {
      throw new Error('Need at least 10 samples for training');
    }

    console.log(`[Train] Loaded ${records.length} samples`);
    console.log(`[Train] Slow threshold: ${config.slowThreshold}ms`);

    console.log('[Train] Preparing features...');
    const { XSeq, XMeta, y } = this.prepareData(records, config.slowThreshold);

    const slowCount = records.filter(r => r.executionTimeMs > config.slowThreshold).length;
    const fastCount = records.length - slowCount;
    console.log(`[Train] Label distribution: ${slowCount} slow, ${fastCount} fast`);

    console.log('[Train] Building model...');
    this.predictor = new QueryPerformancePredictor();
    this.predictor.buildModel();

    const model = this.predictor.getModel()!;
    model.compile({
      optimizer: tf.train.adam(config.learningRate),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy'],
    });

    console.log(`[Train] Starting training for ${config.epochs} epochs...`);
    const history = await model.fit([XSeq, XMeta], y, {
      epochs: config.epochs,
      batchSize: config.batchSize,
      validationSplit: config.validationSplit,
      shuffle: true,
      verbose: 1,
    });

    console.log('[Train] Saving model...');
    const modelVersion = this.saveModel(outputDir);

    console.log('[Train] Building result...');
    const valSamples = Math.floor(records.length * config.validationSplit);
    const trainSamples = records.length - valSamples;

    const lossArray = history.history.loss as number[];
    const accArray = history.history.acc as number[];
    const valLossArray = history.history.val_loss as number[];
    const valAccArray = history.history.val_acc as number[];

    const result: ITrainingResult = {
      modelVersion,
      epochs: config.epochs,
      finalLoss: lossArray[lossArray.length - 1] || 0,
      finalAccuracy: accArray[accArray.length - 1] || 0,
      trainSamples,
      valSamples,
      slowThreshold: config.slowThreshold,
      metrics: {
        loss: lossArray,
        valLoss: valLossArray,
        accuracy: accArray,
        valAccuracy: valAccArray,
      },
    };

    this.saveTrainingResult(outputDir, result);

    // Cleanup tensors
    XSeq.dispose();
    XMeta.dispose();
    y.dispose();

    return result;
  }

  private loadDataset(filePath: string): IFeatureRecord[] {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() !== '');

    return lines
      .map(line => {
        try {
          return JSON.parse(line) as IFeatureRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is IFeatureRecord => r !== null && r.features !== undefined);
  }

  private prepareData(
    records: IFeatureRecord[],
    slowThreshold: number
  ): { XSeq: tf.Tensor; XMeta: tf.Tensor; y: tf.Tensor } {
    const XSeqData: number[][] = [];
    const XMetaData: number[][] = [];
    const yData: number[] = [];

    for (const record of records) {
      const tokenSeq = tokenizeQuery(record.query);
      XSeqData.push(tokenSeq);

      const metaFeatures = FEATURE_KEYS.map(key => record.features[key] || 0);
      XMetaData.push(metaFeatures);

      const label = record.executionTimeMs > slowThreshold ? 1 : 0;
      yData.push(label);
    }

    const XSeq = tf.tensor2d(XSeqData);
    const XMeta = tf.tensor2d(XMetaData);
    const y = tf.tensor2d(yData, [yData.length, 1]);

    return { XSeq, XMeta, y };
  }

  private saveModel(outputDir: string): string {
    if (!this.predictor) throw new Error('Model not trained');

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const version = `v${Date.now()}`;

    // Save topology
    const model = this.predictor.getModel()!;
    const modelJsonPath = `${outputDir}/model-${version}.json`;
    writeFileSync(modelJsonPath, JSON.stringify(model.toJSON(), null, 2));
    console.log(`[Train] Model topology saved to ${modelJsonPath}`);

    // Save weights
    const weightsPath = `${outputDir}/model-${version}-weights.json`;
    this.predictor.saveWeights(weightsPath);
    console.log(`[Train] Model weights saved to ${weightsPath}`);

    console.log(`[Train] Model version: ${version}`);
    return version;
  }

  private saveTrainingResult(outputDir: string, result: ITrainingResult): void {
    const resultPath = `${outputDir}/training-result-${result.modelVersion}.json`;
    writeFileSync(resultPath, JSON.stringify(result, null, 2));
    console.log(`[Train] Training result saved to ${resultPath}`);
  }
}
