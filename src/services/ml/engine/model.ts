import * as tf from '@tensorflow/tfjs';
import * as fs from 'fs';
import { IVectorizedQuery, IPredictionResult } from './types';
import { VOCAB_SIZE, SEQ_LEN } from './tokenizer';

export interface ISerializedWeight {
  name: string;
  shape: number[];
  data: number[];
}

export class QueryPerformancePredictor {
  private model: tf.LayersModel | null = null;
  private readonly EMBEDDING_DIM = 64;
  private readonly LSTM_UNITS = 32;
  private readonly META_DIM = 18;

  public queriesProcessed = 0;
  public isTrainedModel = false;

  public buildModel(): void {
    const inputSeq = tf.input({ shape: [SEQ_LEN], name: 'token_input' });

    const embedding = tf.layers.embedding({
      inputDim: VOCAB_SIZE + 2,
      outputDim: this.EMBEDDING_DIM,
      maskZero: true,
    }).apply(inputSeq);

    const biLstm = tf.layers.bidirectional({
      layer: tf.layers.lstm({
        units: this.LSTM_UNITS,
        returnSequences: false,
        recurrentDropout: 0.2,
      }) as tf.RNN,
    }).apply(embedding);

    const inputMeta = tf.input({ shape: [this.META_DIM], name: 'meta_input' });

    const metaDense = tf.layers.dense({
      units: 16,
      activation: 'relu',
    }).apply(inputMeta);

    const concatenated = tf.layers.concatenate().apply([
      biLstm as tf.SymbolicTensor,
      metaDense as tf.SymbolicTensor,
    ]);

    const hidden1 = tf.layers.dense({ units: 32, activation: 'relu' }).apply(concatenated);
    const output = tf.layers.dense({ units: 1, activation: 'sigmoid', name: 'performance_score' }).apply(hidden1);

    this.model = tf.model({ inputs: [inputSeq, inputMeta], outputs: output as tf.SymbolicTensor });

    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy'],
    });
  }

  public async predict(vector: IVectorizedQuery): Promise<IPredictionResult> {
    this.queriesProcessed++;
    if (!this.model) throw new Error('Model not initialized');

    const seqTensor = tf.tensor2d([vector.tokenSequence]);
    const metaTensor = tf.tensor2d([vector.structuralFeatures]);

    const scoreTensor = this.model.predict([seqTensor, metaTensor]) as tf.Tensor;
    const score = (await scoreTensor.data())[0];

    seqTensor.dispose();
    metaTensor.dispose();
    scoreTensor.dispose();

    return {
      performanceScore: score,
      insights: [],
    };
  }

  public saveWeights(filePath: string): void {
    if (!this.model) throw new Error('Model not initialized');

    const weights = this.model.getWeights();
    const serialized: ISerializedWeight[] = weights.map((w, i) => ({
      name: (w as tf.Variable).name || `weight_${i}`,
      shape: Array.from(w.shape),
      data: Array.from(w.dataSync()),
    }));

    fs.writeFileSync(filePath, JSON.stringify(serialized));
  }

  public loadWeights(filePath: string): void {
    if (!this.model) throw new Error('Model not built. Call buildModel() first.');
    if (!fs.existsSync(filePath)) throw new Error(`Weights file not found: ${filePath}`);

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ISerializedWeight[];
    const tensors = data.map(w => tf.tensor(w.data, w.shape));

    this.model.setWeights(tensors);
    this.isTrainedModel = true;

    // Dispose the temporary tensors after setting weights
    tensors.forEach(t => t.dispose());
  }

  public getModel(): tf.LayersModel | null {
    return this.model;
  }

  public static findLatestModel(modelsDir: string): { topology: string; weights: string } | null {
    const fs = require('fs') as typeof import('fs');
    if (!fs.existsSync(modelsDir)) return null;

    const files = fs.readdirSync(modelsDir) as string[];

    const weightFiles = files
      .filter((f: string) => f.startsWith('model-v') && f.endsWith('-weights.json'))
      .sort()
      .reverse();

    if (weightFiles.length === 0) return null;

    for (const weightFile of weightFiles) {
      const version = weightFile.replace('-weights.json', '').replace('model-', '');
      const topologyFile = `model-${version}.json`;

      if (files.includes(topologyFile)) {
        return {
          topology: `${modelsDir}/${topologyFile}`,
          weights: `${modelsDir}/${weightFile}`,
        };
      }
    }

    return null;
  }
}
