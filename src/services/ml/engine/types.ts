export type SQLTokenType = 'KEYWORD' | 'IDENTIFIER' | 'LITERAL' | 'OPERATOR' | 'UNKNOWN';

export interface ISQLToken {
    value: string;
    type: SQLTokenType;
    index: number;
}

export interface ISQLStructuralFeatures {
    joinCount: number;
    subqueryDepth: number;
    whereClauseComplexity: number;
    selectedColumnsCount: number;
    hasCartesianRisk: number;
    missingIndexCount: number;
    fullTableScanRisk: number;
    estimatedRowsExamined: number;
}

export interface IVectorizedQuery {
    tokenSequence: number[];
    structuralFeatures: number[];
}

export interface ISQLInsight {
    lineNumber: number;
    issueType: 'PERFORMANCE_BOTTLENECK' | 'ANTI_PATTERN' | 'SYNTAX_OPTIMIZATION' | 'SCHEMA_SUGGESTION';
    severityScore: number;
    educationalFix: string;
    affectedSegment: string;
}

export interface IPredictionResult {
    performanceScore: number;
    insights: ISQLInsight[];
}

export interface ISchemaTable {
    name: string;
    columns: Set<string>;
    primaryKey?: string;
    indexes: Set<string>;
}

export interface ISchemaRegistry {
    tables: Map<string, ISchemaTable>;
    registerTable(ddl: string): void;
    isIndexed(table: string, column: string): boolean;
}
