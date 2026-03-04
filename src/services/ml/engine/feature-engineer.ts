import { ISQLStructuralFeatures, IVectorizedQuery, ISQLToken, ISchemaRegistry, SQLTokenType } from './types';

export class SQLFeatureEngineer {
    private readonly vocab: Map<string, number>;
    private readonly MAX_SEQ_LEN = 100;
    private readonly UNK_TOKEN = 1;
    private readonly PAD_TOKEN = 0;

    public getVocabSize(): number {
        return this.vocab.size;
    }

    constructor(
        vocabList: string[],
        private readonly schemaRegistry?: ISchemaRegistry
    ) {
        this.vocab = new Map(vocabList.map((word, i) => [word, i + 2]));
    }

    public process(query: string): IVectorizedQuery {
        const tokens = this.tokenize(query);
        const sequence = this.padSequence(this.tokensToIndices(tokens));
        const features = this.extractStructuralFeatures(query, tokens);

        return {
            tokenSequence: sequence,
            structuralFeatures: this.normalizeFeatures(features)
        };
    }

    private tokenize(query: string): ISQLToken[] {
        const regex = /\s*(\w+|[=<>!]+|\(|\)|,)\s*/g;
        const tokens: ISQLToken[] = [];
        let match;
        
        while ((match = regex.exec(query)) !== null) {
            tokens.push({
                value: match[1].toUpperCase(),
                type: this.getTokenType(match[1]),
                index: match.index
            });
        }
        return tokens;
    }

    private extractStructuralFeatures(query: string, tokens: ISQLToken[]): ISQLStructuralFeatures {
        const upperQ = query.toUpperCase();
        
        const joinCount = (upperQ.match(/JOIN/g) || []).length;
        const whereComplexity = (upperQ.match(/\bAND\b|\bOR\b|\bIN\b/g) || []).length;
        const selectedColumnsCount = (query.split(/FROM/i)[0].match(/,/g) || []).length + 1;

        let hasCartesianRisk = 0;
        const fromClause = upperQ.match(/FROM\s+(.+?)(\s+WHERE|\s+GROUP|\s+ORDER|$)/i);
        if (fromClause && fromClause[1].includes(',') && !upperQ.includes('JOIN')) {
            hasCartesianRisk = 1;
        }

        const fullTableScanRisk = (upperQ.match(/LIKE\s+'%/g) || []).length > 0 ? 1 : 0;

        let missingIndexCount = 0;
        if (this.schemaRegistry) {
            const whereMatches = upperQ.matchAll(/WHERE\s+(\w+)\s*=/g);
            const tableMatch = upperQ.match(/FROM\s+`?(\w+)`?/);
            if (tableMatch) {
                const tableName = tableMatch[1];
                for (const match of whereMatches) {
                    const col = match[1];
                    if (!this.schemaRegistry.isIndexed(tableName, col)) {
                        missingIndexCount++;
                    }
                }
            }
        }

        return {
            joinCount,
            subqueryDepth: this.calculateMaxDepth(tokens),
            whereClauseComplexity: whereComplexity,
            selectedColumnsCount,
            hasCartesianRisk,
            missingIndexCount,
            fullTableScanRisk,
            estimatedRowsExamined: 0
        };
    }

    private padSequence(indices: number[]): number[] {
        if (indices.length > this.MAX_SEQ_LEN) {
            return indices.slice(0, this.MAX_SEQ_LEN);
        }
        return [...indices, ...new Array(this.MAX_SEQ_LEN - indices.length).fill(this.PAD_TOKEN)];
    }

    private tokensToIndices(tokens: ISQLToken[]): number[] {
        return tokens.map(t => this.vocab.get(t.value) || this.UNK_TOKEN);
    }

    private calculateMaxDepth(tokens: ISQLToken[]): number {
        let maxDepth = 0;
        let currentDepth = 0;
        tokens.forEach(t => {
            if (t.value === '(') currentDepth++;
            if (t.value === ')') currentDepth--;
            if (currentDepth > maxDepth) maxDepth = currentDepth;
        });
        return maxDepth;
    }

    private getTokenType(val: string): SQLTokenType { 
        if (['SELECT', 'FROM', 'WHERE', 'JOIN', 'AND', 'OR'].includes(val.toUpperCase())) return 'KEYWORD';
        if (val.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) return 'IDENTIFIER';
        if (val.match(/^['"].*['"]$/)) return 'LITERAL';
        if (['=', '<', '>', '!', '(', ')', ','].includes(val)) return 'OPERATOR';
        return 'UNKNOWN';
    }
    
    private normalizeFeatures(features: ISQLStructuralFeatures): number[] {
        return [
            Math.min(features.joinCount / 10, 1),
            Math.min(features.subqueryDepth / 5, 1),
            Math.min(features.whereClauseComplexity / 10, 1),
            Math.min(features.selectedColumnsCount / 20, 1),
            features.hasCartesianRisk,
            Math.min(features.missingIndexCount / 5, 1),
            features.fullTableScanRisk,
            0
        ];
    }
}
