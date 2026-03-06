import { MLQueryEngine } from './ml/engine';
import { ISQLInsight } from './ml/engine/types';
import { IExtractedFeatures } from './ml/engine/feature-extractor';

export interface MLPredictionRequest {
  sql: string;
}

export interface MLPredictionResponse {
  performanceScore: number;
  insights: ISQLInsight[];
  features: IExtractedFeatures;
  mlAvailable: boolean;
}

export class MLPredictionService {
  private engine: MLQueryEngine | null = null;

  async initialize(modelsDir?: string): Promise<void> {
    this.engine = new MLQueryEngine();
    await this.engine.start(modelsDir || 'models');
    console.log('[MLPredictionService] Engine initialized successfully');
  }

  async predict(request: MLPredictionRequest): Promise<MLPredictionResponse> {
    if (!this.engine) {
      throw new Error('ML engine not initialized');
    }

    const result = await this.engine.processQuery(request.sql);

    return {
      performanceScore: result.performanceScore,
      insights: result.insights,
      features: result.features,
      mlAvailable: result.mlAvailable,
    };
  }

  async getStatus(): Promise<Record<string, unknown>> {
    const stats = this.engine?.getStats() || {};

    return {
      isLoaded: !!this.engine,
      ...stats,
    };
  }
}
