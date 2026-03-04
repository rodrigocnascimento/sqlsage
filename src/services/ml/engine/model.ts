import * as tf from '@tensorflow/tfjs';
import { IVectorizedQuery, IPredictionResult, ISQLInsight } from './types';

export class QueryPerformancePredictor {
    private model: tf.LayersModel | null = null;
    private readonly EMBEDDING_DIM = 64;
    private readonly LSTM_UNITS = 32;
    private readonly META_DIM = 8;
    
    public queriesProcessed = 0;

    constructor(
        private readonly vocabSize: number,
        private readonly inputSeqLen: number
    ) {}

    public buildModel(): void {
        const inputSeq = tf.input({ shape: [this.inputSeqLen], name: 'token_input' });
        
        const embedding = tf.layers.embedding({
            inputDim: this.vocabSize + 2,
            outputDim: this.EMBEDDING_DIM,
            maskZero: true
        }).apply(inputSeq);

        const biLstm = tf.layers.bidirectional({
            layer: tf.layers.lstm({ 
                units: this.LSTM_UNITS, 
                returnSequences: false,
                recurrentDropout: 0.2 
            }) as tf.RNN
        }).apply(embedding);

        const inputMeta = tf.input({ shape: [this.META_DIM], name: 'meta_input' });
        
        const metaDense = tf.layers.dense({ 
            units: 16, 
            activation: 'relu' 
        }).apply(inputMeta);

        const concatenated = tf.layers.concatenate().apply([biLstm as tf.SymbolicTensor, metaDense as tf.SymbolicTensor]);

        const hidden1 = tf.layers.dense({ units: 32, activation: 'relu' }).apply(concatenated);
        const output = tf.layers.dense({ units: 1, activation: 'sigmoid', name: 'performance_score' }).apply(hidden1);

        this.model = tf.model({ inputs: [inputSeq, inputMeta], outputs: output as tf.SymbolicTensor });
        
        this.model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });
    }

    public async explainPrediction(vector: IVectorizedQuery): Promise<IPredictionResult> {
        this.queriesProcessed++;
        if (!this.model) throw new Error('Model not initialized');

        const seqTensor = tf.tensor2d([vector.tokenSequence]);
        const metaTensor = tf.tensor2d([vector.structuralFeatures]);

        const scoreTensor = this.model.predict([seqTensor, metaTensor]) as tf.Tensor;
        const score = (await scoreTensor.data())[0];

        seqTensor.dispose();
        metaTensor.dispose();
        scoreTensor.dispose();

        const insights = this.generateInsights(vector, score);

        return {
            performanceScore: score,
            insights: insights
        };
    }

    private generateInsights(vector: IVectorizedQuery, score: number): ISQLInsight[] {
        const insights: ISQLInsight[] = [];
        const features = vector.structuralFeatures;

        const severityMultiplier = score < 0.2 ? 1.5 : 1.0;
        
        if (features[4] > 0.5) {
            insights.push({
                lineNumber: 1,
                issueType: 'PERFORMANCE_BOTTLENECK',
                severityScore: Math.min(0.9 * severityMultiplier, 1.0),
                educationalFix: 'Implicit cross join detected. Use explicit INNER JOIN syntax with ON conditions to avoid Cartesian products.',
                affectedSegment: 'FROM clause'
            });
        }

        if (features[5] > 0) {
            insights.push({
                lineNumber: 1,
                issueType: 'SCHEMA_SUGGESTION',
                severityScore: Math.min(0.7 * severityMultiplier, 1.0),
                educationalFix: 'Filter condition on unindexed column detected. Consider adding an index to improve lookup speed.',
                affectedSegment: 'WHERE clause'
            });
        }

        if (features[6] > 0) {
            insights.push({
                lineNumber: 1,
                issueType: 'ANTI_PATTERN',
                severityScore: 0.8,
                educationalFix: 'Leading wildcard in LIKE predicate forces a full table scan. Remove the initial % if possible or use Full-Text Search.',
                affectedSegment: 'LIKE predicate'
            });
        }

        return insights;
    }
}
