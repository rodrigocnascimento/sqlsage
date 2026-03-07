import { MLQueryEngine } from './ml/engine/index.js';
import { ISQLInsight } from './ml/engine/types.js';
import { IExtractedFeatures } from './ml/engine/feature-extractor.js';
import { IDatabaseConnector } from './db/connector.js';
import { IExecutionPlan, ICatalogInfo } from './data/types.js';

export interface MLPredictionRequest {
  sql: string;
}

export interface MLPredictionResponse {
  performanceScore: number;
  insights: ISQLInsight[];
  features: IExtractedFeatures;
  mlAvailable: boolean;
  liveExplain: boolean;
  liveCatalog: boolean;
}

export class MLPredictionService {
  private engine: MLQueryEngine | null = null;

  async initialize(modelsDir?: string): Promise<void> {
    this.engine = new MLQueryEngine();
    await this.engine.start(modelsDir || 'models');
    console.log('[MLPredictionService] Engine initialized successfully');
  }

  async predict(request: MLPredictionRequest, connector?: IDatabaseConnector): Promise<MLPredictionResponse> {
    if (!this.engine) {
      throw new Error('ML engine not initialized');
    }

    // Gather live EXPLAIN data if connector is available
    let executionPlans: IExecutionPlan[] = [];
    let catalogInfos: ICatalogInfo[] = [];
    let liveExplain = false;
    let liveCatalog = false;

    if (connector) {
      // Live EXPLAIN
      try {
        executionPlans = await connector.explain(request.sql);
        if (executionPlans.length > 0) {
          liveExplain = true;
          console.log(`[MLPredictionService] Live EXPLAIN returned ${executionPlans.length} plan(s)`);
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[MLPredictionService] Live EXPLAIN failed: ${msg}`);
      }

      // Live catalog info for tables referenced in execution plans
      try {
        const tables = new Set<string>();
        for (const plan of executionPlans) {
          if (plan.table && plan.table !== '') {
            tables.add(plan.table);
          }
        }

        // Also try to extract table names from simple queries
        if (tables.size === 0) {
          const tableMatches = request.sql.match(/\b(?:FROM|JOIN)\s+`?(\w+)`?/gi);
          if (tableMatches) {
            for (const match of tableMatches) {
              const tableName = match.replace(/\b(?:FROM|JOIN)\s+`?/i, '').replace(/`$/, '');
              if (tableName) tables.add(tableName);
            }
          }
        }

        for (const table of tables) {
          const info = await connector.getCatalogInfo(connector.database, table);
          catalogInfos.push(info);
        }

        if (catalogInfos.length > 0) {
          liveCatalog = true;
          console.log(`[MLPredictionService] Live catalog info for ${catalogInfos.length} table(s)`);
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[MLPredictionService] Live catalog info failed: ${msg}`);
      }
    }

    // Pass live data to the engine
    const firstPlan = executionPlans.length > 0 ? executionPlans[0] : undefined;
    const firstCatalog = catalogInfos.length > 0 ? catalogInfos[0] : undefined;

    const result = await this.engine.processQuery(request.sql, firstPlan, firstCatalog);

    return {
      performanceScore: result.performanceScore,
      insights: result.insights,
      features: result.features,
      mlAvailable: result.mlAvailable,
      liveExplain,
      liveCatalog,
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
