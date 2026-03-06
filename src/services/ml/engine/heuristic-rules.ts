import { ISQLInsight } from './types';

export interface IHeuristicRule {
  id: string;
  name: string;
  type: ISQLInsight['issueType'];
  penalty: number;
  check(query: string): ISQLInsight | null;
}

/**
 * Motor de regras heuristicas para deteccao de anti-patterns SQL.
 * Score base = 100. Cada regra violada subtrai uma penalidade.
 * Score final = max(0, 100 - soma_penalidades) / 100.
 */
export class HeuristicEngine {
  private readonly rules: IHeuristicRule[];

  constructor() {
    this.rules = buildRules();
  }

  analyze(query: string): { score: number; insights: ISQLInsight[] } {
    const insights: ISQLInsight[] = [];
    let totalPenalty = 0;

    for (const rule of this.rules) {
      const insight = rule.check(query);
      if (insight) {
        insights.push(insight);
        totalPenalty += rule.penalty;
      }
    }

    const score = Math.max(0, 100 - totalPenalty) / 100;
    return { score, insights };
  }

  getRuleCount(): number {
    return this.rules.length;
  }
}

function makeInsight(
  type: ISQLInsight['issueType'],
  severity: number,
  fix: string,
  segment: string
): ISQLInsight {
  return {
    lineNumber: 1,
    issueType: type,
    severityScore: severity,
    educationalFix: fix,
    affectedSegment: segment,
  };
}

function buildRules(): IHeuristicRule[] {
  return [
    // 1. Cross join implicito
    {
      id: 'cartesian-product',
      name: 'Implicit cross join',
      type: 'PERFORMANCE_BOTTLENECK',
      penalty: 25,
      check(query: string): ISQLInsight | null {
        const upper = query.toUpperCase();
        const fromMatch = upper.match(/\bFROM\s+(.+?)(?:\bWHERE\b|\bGROUP\b|\bORDER\b|\bLIMIT\b|\bUNION\b|;|$)/);
        if (!fromMatch) return null;
        const fromClause = fromMatch[1];
        if (fromClause.includes(',') && !/\bJOIN\b/.test(fromClause)) {
          return makeInsight(
            'PERFORMANCE_BOTTLENECK', 0.9,
            'Cross join implicito detectado. Use JOIN com ON explicito para evitar produto cartesiano.',
            'FROM clause'
          );
        }
        return null;
      },
    },

    // 2. LIKE com wildcard inicial
    {
      id: 'leading-wildcard',
      name: 'LIKE with leading wildcard',
      type: 'ANTI_PATTERN',
      penalty: 15,
      check(query: string): ISQLInsight | null {
        if (/\bLIKE\s+['"]%/i.test(query)) {
          return makeInsight(
            'ANTI_PATTERN', 0.8,
            'LIKE com wildcard inicial forca full table scan. Remova o % inicial ou use Full-Text Search.',
            'LIKE predicate'
          );
        }
        return null;
      },
    },

    // 3. SELECT * com JOIN
    {
      id: 'select-star-join',
      name: 'SELECT * with JOIN',
      type: 'ANTI_PATTERN',
      penalty: 10,
      check(query: string): ISQLInsight | null {
        const upper = query.toUpperCase();
        if (/\bSELECT\s+\*/.test(upper) && /\bJOIN\b/.test(upper)) {
          return makeInsight(
            'ANTI_PATTERN', 0.6,
            'SELECT * com JOIN retorna colunas desnecessarias de todas as tabelas. Especifique apenas as colunas necessarias.',
            'SELECT clause'
          );
        }
        return null;
      },
    },

    // 4. UPDATE/DELETE sem WHERE
    {
      id: 'no-where-mutation',
      name: 'UPDATE/DELETE without WHERE',
      type: 'PERFORMANCE_BOTTLENECK',
      penalty: 30,
      check(query: string): ISQLInsight | null {
        const upper = query.toUpperCase().trim();
        if ((/^\s*UPDATE\b/.test(upper) || /^\s*DELETE\b/.test(upper)) && !/\bWHERE\b/.test(upper)) {
          return makeInsight(
            'PERFORMANCE_BOTTLENECK', 1.0,
            'UPDATE/DELETE sem WHERE afeta TODAS as linhas da tabela. Adicione uma clausula WHERE.',
            'Statement'
          );
        }
        return null;
      },
    },

    // 5. OR em colunas diferentes (non-sargable)
    {
      id: 'or-different-columns',
      name: 'OR across different columns',
      type: 'PERFORMANCE_BOTTLENECK',
      penalty: 10,
      check(query: string): ISQLInsight | null {
        const upper = query.toUpperCase();
        const whereMatch = upper.match(/\bWHERE\b(.+)/);
        if (!whereMatch) return null;
        const whereClause = whereMatch[1];
        const orParts = whereClause.split(/\bOR\b/);
        if (orParts.length < 2) return null;
        const columns = orParts.map(part => {
          const colMatch = part.match(/\b([A-Z_][A-Z0-9_.]*)\s*[=<>!]/);
          return colMatch ? colMatch[1] : null;
        }).filter(Boolean);
        const uniqueColumns = new Set(columns);
        if (uniqueColumns.size > 1) {
          return makeInsight(
            'PERFORMANCE_BOTTLENECK', 0.6,
            'OR entre colunas diferentes impede uso eficiente de indices. Considere UNION ALL ou indices compostos.',
            'WHERE clause'
          );
        }
        return null;
      },
    },

    // 6. Funcao aplicada a coluna no WHERE
    {
      id: 'function-on-column',
      name: 'Function on column in WHERE',
      type: 'ANTI_PATTERN',
      penalty: 15,
      check(query: string): ISQLInsight | null {
        const upper = query.toUpperCase();
        const whereMatch = upper.match(/\bWHERE\b(.+)/);
        if (!whereMatch) return null;
        const whereClause = whereMatch[1];
        if (/\b(UPPER|LOWER|TRIM|SUBSTRING|DATE|YEAR|MONTH|DAY|CONCAT|CAST|CONVERT|IFNULL|COALESCE)\s*\(/i.test(whereClause)) {
          return makeInsight(
            'ANTI_PATTERN', 0.7,
            'Funcao aplicada a coluna no WHERE impede uso de indice. Mova a transformacao para o valor comparado ou use computed column.',
            'WHERE clause'
          );
        }
        return null;
      },
    },

    // 7. Subquery no WHERE
    {
      id: 'subquery-in-where',
      name: 'Subquery in WHERE clause',
      type: 'PERFORMANCE_BOTTLENECK',
      penalty: 20,
      check(query: string): ISQLInsight | null {
        const upper = query.toUpperCase();
        const whereMatch = upper.match(/\bWHERE\b(.+)/);
        if (!whereMatch) return null;
        if (/\(\s*SELECT\b/.test(whereMatch[1])) {
          return makeInsight(
            'PERFORMANCE_BOTTLENECK', 0.7,
            'Subquery no WHERE pode ser executada para cada linha. Considere reescrever como JOIN ou usar EXISTS.',
            'WHERE clause'
          );
        }
        return null;
      },
    },

    // 8. SELECT sem LIMIT
    {
      id: 'no-limit',
      name: 'SELECT without LIMIT',
      type: 'SYNTAX_OPTIMIZATION',
      penalty: 5,
      check(query: string): ISQLInsight | null {
        const upper = query.toUpperCase().trim();
        if (/^\s*SELECT\b/.test(upper) && !/\bLIMIT\b/.test(upper) && !/\bCOUNT\s*\(/.test(upper) && !/\bINSERT\b/.test(upper)) {
          return makeInsight(
            'SYNTAX_OPTIMIZATION', 0.3,
            'SELECT sem LIMIT pode retornar muitas linhas. Adicione LIMIT para queries de leitura.',
            'Statement'
          );
        }
        return null;
      },
    },

    // 9. COUNT(*) sem WHERE
    {
      id: 'count-no-where',
      name: 'COUNT(*) without WHERE',
      type: 'PERFORMANCE_BOTTLENECK',
      penalty: 10,
      check(query: string): ISQLInsight | null {
        const upper = query.toUpperCase();
        if (/\bCOUNT\s*\(\s*\*\s*\)/.test(upper) && !/\bWHERE\b/.test(upper)) {
          return makeInsight(
            'PERFORMANCE_BOTTLENECK', 0.6,
            'COUNT(*) sem WHERE faz full table scan. Adicione filtro ou use tabela de contagem auxiliar.',
            'SELECT clause'
          );
        }
        return null;
      },
    },

    // 10. JOIN sem ON
    {
      id: 'join-no-on',
      name: 'JOIN without ON clause',
      type: 'PERFORMANCE_BOTTLENECK',
      penalty: 25,
      check(query: string): ISQLInsight | null {
        const upper = query.toUpperCase();
        // Procura JOIN <table> que NAO e seguido por ON
        // CROSS JOIN e excecao valida (nao precisa de ON)
        const joinMatches = upper.matchAll(/\b(?:INNER\s+|LEFT\s+|RIGHT\s+)?JOIN\s+\w+/g);
        for (const match of joinMatches) {
          const afterJoin = upper.substring(match.index! + match[0].length, match.index! + match[0].length + 30);
          if (!/^\s+ON\b/.test(afterJoin) && !/\bCROSS\b/.test(match[0])) {
            return makeInsight(
              'PERFORMANCE_BOTTLENECK', 0.9,
              'JOIN sem clausula ON gera produto cartesiano. Adicione ON com a condicao de join.',
              'JOIN clause'
            );
          }
        }
        return null;
      },
    },

    // 11. Multiplos OR que poderiam ser IN()
    {
      id: 'or-to-in',
      name: 'Multiple OR on same column (use IN)',
      type: 'SYNTAX_OPTIMIZATION',
      penalty: 5,
      check(query: string): ISQLInsight | null {
        const upper = query.toUpperCase();
        const whereMatch = upper.match(/\bWHERE\b(.+)/);
        if (!whereMatch) return null;
        // Detecta: col = val OR col = val OR col = val (mesma coluna 3+ vezes)
        const eqMatches = whereMatch[1].matchAll(/\b([A-Z_][A-Z0-9_.]*)\s*=\s*\S+/g);
        const colCounts = new Map<string, number>();
        for (const m of eqMatches) {
          const col = m[1];
          colCounts.set(col, (colCounts.get(col) || 0) + 1);
        }
        for (const [, count] of colCounts) {
          if (count >= 3) {
            return makeInsight(
              'SYNTAX_OPTIMIZATION', 0.3,
              'Multiplos OR na mesma coluna podem ser simplificados com IN(). Melhora legibilidade e pode otimizar execucao.',
              'WHERE clause'
            );
          }
        }
        return null;
      },
    },

    // 12. Nested subqueries (profundidade > 2)
    {
      id: 'deep-subquery',
      name: 'Deeply nested subqueries',
      type: 'PERFORMANCE_BOTTLENECK',
      penalty: 15,
      check(query: string): ISQLInsight | null {
        let depth = 0;
        let maxDepth = 0;
        const upper = query.toUpperCase();
        for (let i = 0; i < upper.length; i++) {
          if (upper[i] === '(' && upper.substring(i + 1, i + 8).trimStart().startsWith('SELECT')) {
            depth++;
            if (depth > maxDepth) maxDepth = depth;
          }
          if (upper[i] === ')') {
            if (depth > 0) depth--;
          }
        }
        if (maxDepth > 2) {
          return makeInsight(
            'PERFORMANCE_BOTTLENECK', 0.7,
            `Subqueries com ${maxDepth} niveis de aninhamento. Considere usar CTEs (WITH) ou JOINs para simplificar.`,
            'Subquery nesting'
          );
        }
        return null;
      },
    },

    // 13. UNION sem ALL
    {
      id: 'union-without-all',
      name: 'UNION without ALL',
      type: 'SYNTAX_OPTIMIZATION',
      penalty: 5,
      check(query: string): ISQLInsight | null {
        const upper = query.toUpperCase();
        if (/\bUNION\b/.test(upper) && !/\bUNION\s+ALL\b/.test(upper)) {
          return makeInsight(
            'SYNTAX_OPTIMIZATION', 0.3,
            'UNION remove duplicatas (sort+distinct implicito). Se duplicatas nao importam, use UNION ALL para melhor performance.',
            'UNION clause'
          );
        }
        return null;
      },
    },

    // 14. Mais de 5 JOINs
    {
      id: 'too-many-joins',
      name: 'More than 5 JOINs',
      type: 'PERFORMANCE_BOTTLENECK',
      penalty: 10,
      check(query: string): ISQLInsight | null {
        const upper = query.toUpperCase();
        const joinMatches = upper.match(/\bJOIN\b/g);
        if (joinMatches && joinMatches.length > 5) {
          return makeInsight(
            'PERFORMANCE_BOTTLENECK', 0.6,
            `Query com ${joinMatches.length} JOINs. Queries com muitos JOINs podem ser lentas. Considere desnormalizar ou dividir a query.`,
            'JOIN clauses'
          );
        }
        return null;
      },
    },

    // 15. SELECT DISTINCT com ORDER BY
    {
      id: 'distinct-order-by',
      name: 'DISTINCT with ORDER BY',
      type: 'ANTI_PATTERN',
      penalty: 10,
      check(query: string): ISQLInsight | null {
        const upper = query.toUpperCase();
        if (/\bSELECT\s+DISTINCT\b/.test(upper) && /\bORDER\s+BY\b/.test(upper)) {
          return makeInsight(
            'ANTI_PATTERN', 0.5,
            'SELECT DISTINCT com ORDER BY forca dupla operacao de sort. Verifique se DISTINCT e realmente necessario.',
            'SELECT/ORDER BY'
          );
        }
        return null;
      },
    },
  ];
}
