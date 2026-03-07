import { ISQLQueryRecord, IExecutionPlan, ICatalogInfo, IIndexInfo } from '../../data/types';

export interface IExtractedFeatures {
  hasJoin: number;
  joinCount: number;
  hasSubquery: number;
  subqueryCount: number;
  hasFunctionInWhere: number;
  selectStar: number;
  tableCount: number;
  whereColumnsIndexed: number;
  estimatedRows: number;
  hasOr: number;
  hasUnion: number;
  hasLike: number;
  hasCountStar: number;
  nestedJoinDepth: number;
  hasGroupBy: number;
  hasOrderBy: number;
  hasLimit: number;
  orConditionCount: number;
}

export class FeatureExtractor {
  extract(query: string, executionPlan?: IExecutionPlan, catalogInfo?: ICatalogInfo): IExtractedFeatures {
    const normalizedQuery = query.toUpperCase();

    const features: IExtractedFeatures = {
      hasJoin: this.hasJoin(normalizedQuery) ? 1 : 0,
      joinCount: this.countJoins(normalizedQuery),
      hasSubquery: this.hasSubquery(normalizedQuery) ? 1 : 0,
      subqueryCount: this.countSubqueries(normalizedQuery),
      hasFunctionInWhere: this.hasFunctionInWhere(normalizedQuery) ? 1 : 0,
      selectStar: this.hasSelectStar(normalizedQuery) ? 1 : 0,
      tableCount: this.countTables(normalizedQuery),
      whereColumnsIndexed: this.checkWhereColumnsIndexed(normalizedQuery, catalogInfo),
      estimatedRows: executionPlan ? this.normalizeRows(executionPlan.rowsExamined) : 0,
      hasOr: this.hasOr(normalizedQuery) ? 1 : 0,
      hasUnion: this.hasUnion(normalizedQuery) ? 1 : 0,
      hasLike: this.hasLike(normalizedQuery) ? 1 : 0,
      hasCountStar: this.hasCountStar(normalizedQuery) ? 1 : 0,
      nestedJoinDepth: this.getNestedJoinDepth(normalizedQuery),
      hasGroupBy: this.hasGroupBy(normalizedQuery) ? 1 : 0,
      hasOrderBy: this.hasOrderBy(normalizedQuery) ? 1 : 0,
      hasLimit: this.hasLimit(normalizedQuery) ? 1 : 0,
      orConditionCount: this.countOrConditions(normalizedQuery),
    };

    return features;
  }

  extractFromRecord(record: ISQLQueryRecord): IExtractedFeatures {
    return this.extract(record.query, record.executionPlan, record.catalogInfo);
  }

  private hasJoin(query: string): boolean {
    return /\b(JOIN|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|CROSS\s+JOIN)\b/.test(query);
  }

  private countJoins(query: string): number {
    const matches = query.match(/\b(JOIN|INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|CROSS\s+JOIN)\b/g);
    return matches ? matches.length : 0;
  }

  private hasSubquery(query: string): boolean {
    return /\(\s*SELECT\b/.test(query);
  }

  private countSubqueries(query: string): number {
    const matches = query.match(/\(/g);
    return matches ? Math.min(matches.length - 1, 5) : 0;
  }

  private hasFunctionInWhere(query: string): boolean {
    const whereMatch = query.match(/\bWHERE\b(.+)/);
    if (!whereMatch) return false;
    const whereClause = whereMatch[1];
    return /\b(FUNCTION|CONCAT|LOWER|UPPER|TRIM|SUBSTRING|DATE|NOW|IFNULL|COALESCE)\b/i.test(whereClause) ||
           /\w+\(\w+\)/.test(whereClause);
  }

  private hasSelectStar(query: string): boolean {
    return /\bSELECT\s+\*\s+FROM\b/.test(query);
  }

  private countTables(query: string): number {
    const fromMatch = query.match(/\bFROM\s+([^\s;]+)/g);
    if (!fromMatch) return 0;
    let count = fromMatch.length;
    if (query.includes('JOIN')) {
      const joinMatch = query.match(/\bJOIN\s+([^\s;]+)/g);
      if (joinMatch) count += joinMatch.length;
    }
    return Math.min(count, 10);
  }

  private checkWhereColumnsIndexed(query: string, catalogInfo?: ICatalogInfo): number {
    if (!catalogInfo || !catalogInfo.indexes || catalogInfo.indexes.length === 0) return 0;
    const whereMatch = query.match(/\bWHERE\s+(.+?)(?:GROUP|ORDER|LIMIT|$)/i);
    if (!whereMatch) return 0;
    const whereClause = whereMatch[1].toLowerCase();
    const indexedColumns = new Set(
      catalogInfo.indexes.flatMap((idx: IIndexInfo) => idx.columns)
    );
    const queryColumns = whereClause.match(/\b[a-z_][a-z0-9_]*\b/g) || [];
    const indexedInQuery = queryColumns.filter(col => indexedColumns.has(col));
    return indexedInQuery.length > 0 ? 1 : 0;
  }

  private normalizeRows(rows: number): number {
    const maxRows = 1000000;
    return Math.min(rows / maxRows, 1);
  }

  private hasOr(query: string): boolean {
    return /\bWHERE\b.*\bOR\b/.test(query);
  }

  private hasUnion(query: string): boolean {
    return /\b(UNION|UNION\s+ALL)\b/.test(query);
  }

  private hasLike(query: string): boolean {
    return /\bLIKE\b/.test(query);
  }

  private hasCountStar(query: string): boolean {
    return /\bCOUNT\s*\(\s*\*\s*\)/.test(query);
  }

  private getNestedJoinDepth(query: string): number {
    const joinMatches = query.match(/JOIN/g);
    if (!joinMatches) return 0;
    const depth = Math.min(joinMatches.length - 1, 3);
    return depth;
  }

  private hasGroupBy(query: string): boolean {
    return /\bGROUP\s+BY\b/.test(query);
  }

  private hasOrderBy(query: string): boolean {
    return /\bORDER\s+BY\b/.test(query);
  }

  private hasLimit(query: string): boolean {
    return /\bLIMIT\b/.test(query);
  }

  private countOrConditions(query: string): number {
    const whereMatch = query.match(/\bWHERE\b(.+)/i);
    if (!whereMatch) return 0;
    const orMatches = whereMatch[1].match(/\bOR\b/gi);
    return orMatches ? Math.min(orMatches.length, 5) : 0;
  }

  toArray(features: IExtractedFeatures): number[] {
    return [
      features.hasJoin,
      features.joinCount,
      features.hasSubquery,
      features.subqueryCount,
      features.hasFunctionInWhere,
      features.selectStar,
      features.tableCount,
      features.whereColumnsIndexed,
      features.estimatedRows,
      features.hasOr,
      features.hasUnion,
      features.hasLike,
      features.hasCountStar,
      features.nestedJoinDepth,
      features.hasGroupBy,
      features.hasOrderBy,
      features.hasLimit,
      features.orConditionCount,
    ];
  }
}
