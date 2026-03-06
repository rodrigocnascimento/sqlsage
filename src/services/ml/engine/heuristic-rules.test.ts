import { describe, it, expect, beforeEach } from 'vitest';
import { HeuristicEngine } from './heuristic-rules.js';

describe('HeuristicEngine', () => {
  let engine: HeuristicEngine;

  beforeEach(() => {
    engine = new HeuristicEngine();
  });

  describe('constructor', () => {
    it('should create engine with 15 rules', () => {
      expect(engine.getRuleCount()).toBe(15);
    });
  });

  describe('analyze - score', () => {
    it('should return score of 1.0 for a clean query', () => {
      const result = engine.analyze('SELECT id FROM users WHERE id = 1 LIMIT 10');
      expect(result.score).toBe(1.0);
    });

    it('should return score between 0 and 1', () => {
      const result = engine.analyze('SELECT * FROM users, orders');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('should return lower score for more violations', () => {
      const clean = engine.analyze('SELECT id FROM users WHERE id = 1 LIMIT 10');
      const bad = engine.analyze('SELECT * FROM users, orders');
      expect(bad.score).toBeLessThan(clean.score);
    });

    it('should clamp score to minimum of 0', () => {
      // A query that triggers many heavy rules
      const result = engine.analyze('DELETE FROM users');
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('rule: cartesian-product', () => {
    it('should detect implicit cross join (comma-separated FROM)', () => {
      const result = engine.analyze('SELECT * FROM users, orders WHERE users.id = 1');
      const insight = result.insights.find(i => i.affectedSegment === 'FROM clause' && i.issueType === 'PERFORMANCE_BOTTLENECK');
      expect(insight).toBeDefined();
    });

    it('should not trigger for single table', () => {
      const result = engine.analyze('SELECT * FROM users WHERE id = 1');
      const insight = result.insights.find(i => i.affectedSegment === 'FROM clause' && i.issueType === 'PERFORMANCE_BOTTLENECK');
      expect(insight).toBeUndefined();
    });
  });

  describe('rule: leading-wildcard', () => {
    it('should detect LIKE with leading %', () => {
      const result = engine.analyze("SELECT * FROM users WHERE name LIKE '%test'");
      const insight = result.insights.find(i => i.issueType === 'ANTI_PATTERN' && i.affectedSegment === 'LIKE predicate');
      expect(insight).toBeDefined();
    });

    it('should not trigger for trailing wildcard only', () => {
      const result = engine.analyze("SELECT * FROM users WHERE name LIKE 'test%'");
      const insight = result.insights.find(i => i.affectedSegment === 'LIKE predicate');
      expect(insight).toBeUndefined();
    });
  });

  describe('rule: select-star-join', () => {
    it('should detect SELECT * with JOIN', () => {
      const result = engine.analyze('SELECT * FROM users JOIN orders ON users.id = orders.user_id');
      const insight = result.insights.find(i => i.issueType === 'ANTI_PATTERN' && i.affectedSegment === 'SELECT clause');
      expect(insight).toBeDefined();
    });

    it('should not trigger for SELECT * without JOIN', () => {
      const result = engine.analyze('SELECT * FROM users WHERE id = 1');
      const insight = result.insights.find(i => i.issueType === 'ANTI_PATTERN' && i.affectedSegment === 'SELECT clause');
      expect(insight).toBeUndefined();
    });
  });

  describe('rule: no-where-mutation', () => {
    it('should detect UPDATE without WHERE', () => {
      const result = engine.analyze('UPDATE users SET active = 0');
      const insight = result.insights.find(i => i.issueType === 'PERFORMANCE_BOTTLENECK' && i.severityScore === 1.0);
      expect(insight).toBeDefined();
    });

    it('should detect DELETE without WHERE', () => {
      const result = engine.analyze('DELETE FROM users');
      const insight = result.insights.find(i => i.issueType === 'PERFORMANCE_BOTTLENECK' && i.severityScore === 1.0);
      expect(insight).toBeDefined();
    });

    it('should not trigger for UPDATE with WHERE', () => {
      const result = engine.analyze('UPDATE users SET active = 0 WHERE id = 1');
      const insight = result.insights.find(i => i.severityScore === 1.0 && i.affectedSegment === 'Statement');
      expect(insight).toBeUndefined();
    });
  });

  describe('rule: function-on-column', () => {
    it('should detect function in WHERE clause', () => {
      const result = engine.analyze("SELECT * FROM users WHERE UPPER(name) = 'TEST'");
      const insight = result.insights.find(i => i.issueType === 'ANTI_PATTERN' && i.affectedSegment === 'WHERE clause');
      expect(insight).toBeDefined();
    });
  });

  describe('rule: subquery-in-where', () => {
    it('should detect subquery in WHERE', () => {
      const result = engine.analyze('SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)');
      const insight = result.insights.find(i => i.issueType === 'PERFORMANCE_BOTTLENECK' && i.affectedSegment === 'WHERE clause');
      expect(insight).toBeDefined();
    });
  });

  describe('rule: no-limit', () => {
    it('should detect SELECT without LIMIT', () => {
      const result = engine.analyze('SELECT id FROM users WHERE id = 1');
      const insight = result.insights.find(i => i.issueType === 'SYNTAX_OPTIMIZATION' && i.affectedSegment === 'Statement');
      expect(insight).toBeDefined();
    });

    it('should not trigger when LIMIT is present', () => {
      const result = engine.analyze('SELECT id FROM users WHERE id = 1 LIMIT 10');
      const insight = result.insights.find(i => i.issueType === 'SYNTAX_OPTIMIZATION' && i.affectedSegment === 'Statement');
      expect(insight).toBeUndefined();
    });

    it('should not trigger for COUNT queries', () => {
      const result = engine.analyze('SELECT COUNT(*) FROM users WHERE active = 1');
      const insight = result.insights.find(i => i.issueType === 'SYNTAX_OPTIMIZATION' && i.affectedSegment === 'Statement');
      expect(insight).toBeUndefined();
    });
  });

  describe('rule: count-no-where', () => {
    it('should detect COUNT(*) without WHERE', () => {
      const result = engine.analyze('SELECT COUNT(*) FROM users');
      const insight = result.insights.find(i => i.affectedSegment === 'SELECT clause' && i.issueType === 'PERFORMANCE_BOTTLENECK');
      expect(insight).toBeDefined();
    });

    it('should not trigger for COUNT(*) with WHERE', () => {
      const result = engine.analyze('SELECT COUNT(*) FROM users WHERE active = 1');
      const insight = result.insights.find(i => i.affectedSegment === 'SELECT clause' && i.issueType === 'PERFORMANCE_BOTTLENECK');
      expect(insight).toBeUndefined();
    });
  });

  describe('rule: union-without-all', () => {
    it('should detect UNION without ALL', () => {
      const result = engine.analyze('SELECT id FROM users UNION SELECT id FROM admins');
      const insight = result.insights.find(i => i.affectedSegment === 'UNION clause');
      expect(insight).toBeDefined();
    });

    it('should not trigger for UNION ALL', () => {
      const result = engine.analyze('SELECT id FROM users UNION ALL SELECT id FROM admins');
      const insight = result.insights.find(i => i.affectedSegment === 'UNION clause');
      expect(insight).toBeUndefined();
    });
  });

  describe('rule: too-many-joins', () => {
    it('should detect more than 5 JOINs', () => {
      const query = 'SELECT * FROM a JOIN b ON a.id=b.id JOIN c ON b.id=c.id JOIN d ON c.id=d.id JOIN e ON d.id=e.id JOIN f ON e.id=f.id JOIN g ON f.id=g.id';
      const result = engine.analyze(query);
      const insight = result.insights.find(i => i.affectedSegment === 'JOIN clauses');
      expect(insight).toBeDefined();
    });

    it('should not trigger for 5 or fewer JOINs', () => {
      const query = 'SELECT * FROM a JOIN b ON a.id=b.id JOIN c ON b.id=c.id';
      const result = engine.analyze(query);
      const insight = result.insights.find(i => i.affectedSegment === 'JOIN clauses');
      expect(insight).toBeUndefined();
    });
  });

  describe('rule: distinct-order-by', () => {
    it('should detect SELECT DISTINCT with ORDER BY', () => {
      const result = engine.analyze('SELECT DISTINCT name FROM users ORDER BY name');
      const insight = result.insights.find(i => i.affectedSegment === 'SELECT/ORDER BY');
      expect(insight).toBeDefined();
    });

    it('should not trigger for DISTINCT without ORDER BY', () => {
      const result = engine.analyze('SELECT DISTINCT name FROM users');
      const insight = result.insights.find(i => i.affectedSegment === 'SELECT/ORDER BY');
      expect(insight).toBeUndefined();
    });
  });

  describe('insights structure', () => {
    it('should return insights with all required fields', () => {
      const result = engine.analyze('DELETE FROM users');
      expect(result.insights.length).toBeGreaterThan(0);

      for (const insight of result.insights) {
        expect(insight).toHaveProperty('lineNumber');
        expect(insight).toHaveProperty('issueType');
        expect(insight).toHaveProperty('severityScore');
        expect(insight).toHaveProperty('educationalFix');
        expect(insight).toHaveProperty('affectedSegment');
        expect(typeof insight.educationalFix).toBe('string');
        expect(insight.educationalFix.length).toBeGreaterThan(0);
      }
    });

    it('should return valid issueType values', () => {
      const result = engine.analyze("SELECT * FROM users, orders WHERE name LIKE '%x'");
      const validTypes = ['PERFORMANCE_BOTTLENECK', 'ANTI_PATTERN', 'SYNTAX_OPTIMIZATION', 'SCHEMA_SUGGESTION'];

      for (const insight of result.insights) {
        expect(validTypes).toContain(insight.issueType);
      }
    });

    it('should return severity scores between 0 and 1', () => {
      const result = engine.analyze('DELETE FROM users');

      for (const insight of result.insights) {
        expect(insight.severityScore).toBeGreaterThan(0);
        expect(insight.severityScore).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty string without errors', () => {
      const result = engine.analyze('');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('should handle non-SQL text gracefully', () => {
      const result = engine.analyze('this is just some random text');
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('should return no insights for well-optimized query', () => {
      const result = engine.analyze('SELECT id, name FROM users WHERE id = 1 LIMIT 1');
      expect(result.insights).toHaveLength(0);
      expect(result.score).toBe(1.0);
    });
  });
});
