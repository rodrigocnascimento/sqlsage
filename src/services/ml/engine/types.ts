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
