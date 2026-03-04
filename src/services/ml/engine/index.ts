import { SchemaRegistry } from './schema-registry';
import { SQLFeatureEngineer } from './feature-engineer';
import { QueryPerformancePredictor } from './model';
import { ISQLInsight } from './types';

export class MLQueryEngine {
    public schemaRegistry: SchemaRegistry;
    public featureEngineer: SQLFeatureEngineer;
    public model: QueryPerformancePredictor;
    
    private tokensRead = 0;
    private trainingSessions = 0;
    private totalImprovementsSuggested = 0;
    private totalPerformanceScore = 0;

    constructor(dataDir: string = 'dataset') {
        this.schemaRegistry = new SchemaRegistry();

        const initialVocab = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'AND', 'OR', 'GROUP', 'BY', 'ORDER', 'LIMIT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'TABLE', 'INT', 'VARCHAR', 'PRIMARY', 'KEY'];
        this.featureEngineer = new SQLFeatureEngineer(initialVocab, this.schemaRegistry);

        this.model = new QueryPerformancePredictor(initialVocab.length, 100);
    }

    public async start(): Promise<void> {
        this.model.buildModel();
        console.log('[ML Engine] Model compiled.');
    }

    public getStats() {
        const avgScore = this.trainingSessions > 0 
            ? this.totalPerformanceScore / this.trainingSessions 
            : 0;

        return {
            schemasLearned: this.schemaRegistry.getStats().tableCount || 0,
            queriesAnalyzed: this.model.queriesProcessed || 0,
            tokensRead: this.tokensRead,
            trainingSessions: this.trainingSessions,
            improvementsSuggested: this.totalImprovementsSuggested,
            averageScore: avgScore
        };
    }

    public async processQuery(sql: string): Promise<{ performanceScore: number; insights: ISQLInsight[] }> {
        const vector = this.featureEngineer.process(sql);
        this.tokensRead += sql.split(/\s+/).length;

        const prediction = await this.model.explainPrediction(vector);
        
        this.trainingSessions++;
        this.totalPerformanceScore += prediction.performanceScore;
        this.totalImprovementsSuggested += prediction.insights.length;

        return {
            performanceScore: prediction.performanceScore,
            insights: prediction.insights
        };
    }
}
