import { QueryPerformancePredictor } from './model.js';
import { HeuristicEngine } from './heuristic-rules.js';
import { FeatureExtractor, IExtractedFeatures } from './feature-extractor.js';
import { tokenizeQuery } from './tokenizer.js';
import { ISQLInsight, IVectorizedQuery } from './types.js';
import { IExecutionPlan, ICatalogInfo } from '../../data/types.js';

export class MLQueryEngine {
  public model: QueryPerformancePredictor;
  public heuristicEngine: HeuristicEngine;
  public featureExtractor: FeatureExtractor;

  private tokensRead = 0;
  private totalImprovementsSuggested = 0;
  private totalPerformanceScore = 0;
  private queriesProcessed = 0;

  constructor() {
    this.model = new QueryPerformancePredictor();
    this.heuristicEngine = new HeuristicEngine();
    this.featureExtractor = new FeatureExtractor();
  }

  public async start(modelsDir?: string): Promise<void> {
    this.model.buildModel();

    // Try to load trained weights
    if (modelsDir) {
      const latest = QueryPerformancePredictor.findLatestModel(modelsDir);
      if (latest) {
        try {
          this.model.loadWeights(latest.weights);
          console.log(`[ML Engine] Loaded trained model: ${latest.weights}`);
        } catch (err) {
          console.warn(`[ML Engine] Failed to load model weights: ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    if (!this.model.isTrainedModel) {
      console.log('[ML Engine] No trained model found. Running in heuristics-only mode.');
    }

    console.log('[ML Engine] Engine ready.');
  }

  public getStats(): Record<string, unknown> {
    return {
      queriesAnalyzed: this.queriesProcessed,
      tokensRead: this.tokensRead,
      improvementsSuggested: this.totalImprovementsSuggested,
      averageScore: this.queriesProcessed > 0
        ? this.totalPerformanceScore / this.queriesProcessed
        : 0,
      mlModelLoaded: this.model.isTrainedModel,
      heuristicRules: this.heuristicEngine.getRuleCount(),
    };
  }

  public async processQuery(
    sql: string,
    executionPlan?: IExecutionPlan,
    catalogInfo?: ICatalogInfo,
  ): Promise<{
    performanceScore: number;
    insights: ISQLInsight[];
    features: IExtractedFeatures;
    mlAvailable: boolean;
  }> {
    this.tokensRead += sql.split(/\s+/).length;

    // 1. Heuristic analysis (always available)
    const heuristic = this.heuristicEngine.analyze(sql);

    // 2. Feature extraction (with optional live DB data)
    const features = this.featureExtractor.extract(sql, executionPlan, catalogInfo);
    const featureArray = this.featureExtractor.toArray(features);

    // 3. ML prediction (only if trained model available)
    let mlScore: number | null = null;
    if (this.model.isTrainedModel) {
      const tokenSeq = tokenizeQuery(sql);
      const vector: IVectorizedQuery = {
        tokenSequence: tokenSeq,
        structuralFeatures: featureArray,
      };
      const prediction = await this.model.predict(vector);
      mlScore = prediction.performanceScore;
    }

    // 4. Combined score
    let finalScore: number;
    if (mlScore !== null) {
      // Heuristic (60%) + ML (40%)
      finalScore = heuristic.score * 0.6 + (1 - mlScore) * 0.4;
    } else {
      finalScore = heuristic.score;
    }

    // Update stats
    this.queriesProcessed++;
    this.totalPerformanceScore += finalScore;
    this.totalImprovementsSuggested += heuristic.insights.length;

    return {
      performanceScore: finalScore,
      insights: heuristic.insights,
      features,
      mlAvailable: mlScore !== null,
    };
  }
}
