import { MLQueryEngine } from './ml/engine';
import { ISQLInsight, IVectorizedQuery } from './ml/engine/types';

export interface MLPredictionRequest {
  sql: string;
  schemaContext?: string;
}

export interface MLPredictionResponse {
  performanceScore: number;
  insights: ISQLInsight[];
  features: {
    joinCount: number;
    subqueryDepth: number;
    whereClauseComplexity: number;
    selectedColumnsCount: number;
    hasCartesianRisk: boolean;
    missingIndexCount: number;
    fullTableScanRisk: boolean;
  };
  tokens: string[];
}

export class MLPredictionService {
  private engine: MLQueryEngine | null = null;

  async initialize(): Promise<void> {
    this.engine = new MLQueryEngine();
    await this.engine.start();
    console.log('[MLPredictionService] Engine initialized successfully');
  }

  async predict(request: MLPredictionRequest): Promise<MLPredictionResponse> {
    if (!this.engine) {
      throw new Error('ML engine not initialized');
    }

    const vector = this.engine.featureEngineer.process(request.sql);
    const result = await this.engine.model.explainPrediction(vector);
    
    const features = this.extractFeatures(vector);
    const tokens = this.extractTokens(request.sql);

    return {
      performanceScore: result.performanceScore,
      insights: result.insights,
      features,
      tokens,
    };
  }

  async getStatus(): Promise<{
    isLoaded: boolean;
    vocabularySize: number;
    queriesAnalyzed: number;
    trainingSessions: number;
  }> {
    let vocabSize = 21;
    if (this.engine?.featureEngineer && typeof this.engine.featureEngineer.getVocabSize === 'function') {
      vocabSize = this.engine.featureEngineer.getVocabSize();
    }

    const stats = this.engine?.getStats() || {
      queriesAnalyzed: 0,
      trainingSessions: 0
    };

    return {
      isLoaded: !!this.engine,
      vocabularySize: vocabSize,
      queriesAnalyzed: stats.queriesAnalyzed || 0,
      trainingSessions: stats.trainingSessions || 0
    };
  }

  private extractFeatures(vector: IVectorizedQuery): MLPredictionResponse['features'] {
    const f = vector.structuralFeatures;
    return {
      joinCount: Math.round(f[0] * 10),
      subqueryDepth: Math.round(f[1] * 5),
      whereClauseComplexity: Math.round(f[2] * 10),
      selectedColumnsCount: Math.round(f[3] * 20),
      hasCartesianRisk: f[4] > 0.5,
      missingIndexCount: Math.round(f[5] * 5),
      fullTableScanRisk: f[6] > 0.5,
    };
  }

  private extractTokens(sql: string): string[] {
    const regex = /\s*(\w+|[=<>!]+|\(|\)|,)\s*/g;
    const tokens: string[] = [];
    let match;
    
    while ((match = regex.exec(sql)) !== null) {
      tokens.push(match[1].toUpperCase());
      if (tokens.length >= 20) break;
    }
    
    return tokens;
  }
}
