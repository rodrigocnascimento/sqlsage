import { describe, it, expect, beforeEach } from 'vitest';
import { FeatureExtractor, IExtractedFeatures } from './feature-extractor.js';
import { ICatalogInfo, IExecutionPlan, ISQLQueryRecord } from '../../data/types.js';

describe('FeatureExtractor', () => {
  let extractor: FeatureExtractor;

  beforeEach(() => {
    extractor = new FeatureExtractor();
  });

  describe('extract - simple queries', () => {
    it('should return all zeros for a simple SELECT without features', () => {
      const features = extractor.extract('SELECT id FROM users');
      expect(features.hasJoin).toBe(0);
      expect(features.joinCount).toBe(0);
      expect(features.hasSubquery).toBe(0);
      expect(features.subqueryCount).toBe(0);
      expect(features.hasFunctionInWhere).toBe(0);
      expect(features.selectStar).toBe(0);
      expect(features.tableCount).toBe(1);
      expect(features.whereColumnsIndexed).toBe(0);
      expect(features.estimatedRows).toBe(0);
      expect(features.hasOr).toBe(0);
      expect(features.hasUnion).toBe(0);
      expect(features.hasLike).toBe(0);
      expect(features.hasCountStar).toBe(0);
      expect(features.nestedJoinDepth).toBe(0);
      expect(features.hasGroupBy).toBe(0);
      expect(features.hasOrderBy).toBe(0);
      expect(features.hasLimit).toBe(0);
      expect(features.orConditionCount).toBe(0);
    });

    it('should handle case-insensitive queries', () => {
      const features = extractor.extract('select * from users');
      expect(features.selectStar).toBe(1);
      expect(features.tableCount).toBe(1);
    });
  });

  describe('extract - JOIN detection', () => {
    it('should detect INNER JOIN', () => {
      const features = extractor.extract('SELECT u.id FROM users u INNER JOIN orders o ON u.id = o.user_id');
      expect(features.hasJoin).toBe(1);
      expect(features.joinCount).toBe(1);
    });

    it('should detect LEFT JOIN', () => {
      const features = extractor.extract('SELECT u.id FROM users u LEFT JOIN orders o ON u.id = o.user_id');
      expect(features.hasJoin).toBe(1);
      expect(features.joinCount).toBe(1);
    });

    it('should detect RIGHT JOIN', () => {
      const features = extractor.extract('SELECT u.id FROM users u RIGHT JOIN orders o ON u.id = o.user_id');
      expect(features.hasJoin).toBe(1);
      expect(features.joinCount).toBe(1);
    });

    it('should detect CROSS JOIN', () => {
      const features = extractor.extract('SELECT u.id FROM users u CROSS JOIN orders o');
      expect(features.hasJoin).toBe(1);
      expect(features.joinCount).toBe(1);
    });

    it('should count multiple JOINs', () => {
      const query = 'SELECT u.id FROM users u INNER JOIN orders o ON u.id = o.user_id LEFT JOIN products p ON o.product_id = p.id';
      const features = extractor.extract(query);
      expect(features.hasJoin).toBe(1);
      expect(features.joinCount).toBe(2);
    });
  });

  describe('extract - subquery detection', () => {
    it('should detect a subquery with (SELECT pattern', () => {
      const features = extractor.extract('SELECT id FROM users WHERE id IN (SELECT user_id FROM orders)');
      expect(features.hasSubquery).toBe(1);
    });

    it('should NOT treat aggregate functions as subqueries', () => {
      const features = extractor.extract('SELECT (MAX(id)) FROM users');
      expect(features.hasSubquery).toBe(0);
    });

    it('should NOT treat COUNT(*) as a subquery', () => {
      const features = extractor.extract('SELECT COUNT(*) FROM orders WHERE status = \'completed\'');
      expect(features.hasSubquery).toBe(0);
    });

    it('should NOT treat SUM/AVG/MAX as subqueries', () => {
      expect(extractor.extract('SELECT SUM(quantity) FROM order_items WHERE product_id = 20').hasSubquery).toBe(0);
      expect(extractor.extract('SELECT AVG(price) FROM products WHERE category_id = 8').hasSubquery).toBe(0);
      expect(extractor.extract('SELECT MAX(created_at) FROM orders WHERE user_id = 5').hasSubquery).toBe(0);
    });

    it('should count subqueries based on parentheses minus 1', () => {
      // 2 open parens => subqueryCount = min(2-1, 5) = 1
      const features = extractor.extract('SELECT id FROM users WHERE id IN (SELECT user_id FROM orders WHERE status = (SELECT id FROM statuses))');
      expect(features.subqueryCount).toBeGreaterThanOrEqual(1);
      expect(features.subqueryCount).toBeLessThanOrEqual(5);
    });

    it('should cap subqueryCount at 5', () => {
      // Create a query with many parentheses (7 open parens => min(7-1, 5) = 5)
      const query = 'SELECT id FROM t WHERE a IN (1) AND b IN (2) AND c IN (3) AND d IN (4) AND e IN (5) AND f IN (6) AND g IN (7)';
      const features = extractor.extract(query);
      expect(features.subqueryCount).toBeLessThanOrEqual(5);
    });
  });

  describe('extract - function in WHERE', () => {
    it('should detect LOWER function in WHERE clause', () => {
      const features = extractor.extract('SELECT id FROM users WHERE LOWER(name) = \'john\'');
      expect(features.hasFunctionInWhere).toBe(1);
    });

    it('should detect CONCAT function in WHERE clause', () => {
      const features = extractor.extract('SELECT id FROM users WHERE CONCAT(first, last) = \'JohnDoe\'');
      expect(features.hasFunctionInWhere).toBe(1);
    });

    it('should detect COALESCE function in WHERE clause', () => {
      const features = extractor.extract('SELECT id FROM users WHERE COALESCE(name, \'default\') = \'john\'');
      expect(features.hasFunctionInWhere).toBe(1);
    });

    it('should detect word(word) pattern in WHERE clause', () => {
      const features = extractor.extract('SELECT id FROM users WHERE myfunc(col) = 1');
      expect(features.hasFunctionInWhere).toBe(1);
    });

    it('should not detect function when no WHERE clause', () => {
      const features = extractor.extract('SELECT LOWER(name) FROM users');
      expect(features.hasFunctionInWhere).toBe(0);
    });
  });

  describe('extract - SELECT * detection', () => {
    it('should detect SELECT * FROM', () => {
      const features = extractor.extract('SELECT * FROM users');
      expect(features.selectStar).toBe(1);
    });

    it('should not flag SELECT with specific columns', () => {
      const features = extractor.extract('SELECT id, name FROM users');
      expect(features.selectStar).toBe(0);
    });
  });

  describe('extract - table counting', () => {
    it('should count 1 table for simple FROM', () => {
      const features = extractor.extract('SELECT id FROM users');
      expect(features.tableCount).toBe(1);
    });

    it('should count FROM + JOIN tables', () => {
      const query = 'SELECT u.id FROM users u JOIN orders o ON u.id = o.user_id JOIN products p ON o.product_id = p.id';
      const features = extractor.extract(query);
      // 1 FROM + 2 JOINs = 3
      expect(features.tableCount).toBe(3);
    });

    it('should cap table count at 10', () => {
      // Build a query with many JOINs
      let query = 'SELECT t.id FROM t0 t';
      for (let i = 1; i <= 12; i++) {
        query += ` JOIN t${i} ON t.id = t${i}.id`;
      }
      const features = extractor.extract(query);
      expect(features.tableCount).toBe(10);
    });
  });

  describe('extract - WHERE columns indexed', () => {
    it('should return 1 when WHERE column matches an index', () => {
      const catalogInfo: ICatalogInfo = {
        database: 'test',
        table: 'users',
        rowCount: 1000,
        avgRowLength: 100,
        indexes: [
          { name: 'idx_email', columns: ['email'], isUnique: true },
        ],
      };
      const features = extractor.extract('SELECT id FROM users WHERE email = \'test@test.com\'', undefined, catalogInfo);
      expect(features.whereColumnsIndexed).toBe(1);
    });

    it('should return 0 when WHERE column does not match any index', () => {
      const catalogInfo: ICatalogInfo = {
        database: 'test',
        table: 'users',
        rowCount: 1000,
        avgRowLength: 100,
        indexes: [
          { name: 'idx_email', columns: ['email'], isUnique: true },
        ],
      };
      const features = extractor.extract('SELECT id FROM users WHERE name = \'john\'', undefined, catalogInfo);
      expect(features.whereColumnsIndexed).toBe(0);
    });

    it('should return 0 when no catalogInfo is provided', () => {
      const features = extractor.extract('SELECT id FROM users WHERE email = \'test@test.com\'');
      expect(features.whereColumnsIndexed).toBe(0);
    });

    it('should return 0 when catalogInfo has no indexes', () => {
      const catalogInfo: ICatalogInfo = {
        database: 'test',
        table: 'users',
        rowCount: 1000,
        avgRowLength: 100,
        indexes: [],
      };
      const features = extractor.extract('SELECT id FROM users WHERE email = \'test@test.com\'', undefined, catalogInfo);
      expect(features.whereColumnsIndexed).toBe(0);
    });
  });

  describe('extract - estimated rows normalization', () => {
    it('should normalize rows by dividing by 1,000,000', () => {
      const plan: IExecutionPlan = {
        id: '1', selectType: 'SIMPLE', table: 'users',
        type: 'ALL', possibleKeys: [], keyUsed: null,
        rowsExamined: 500000, rowsReturned: 100,
      };
      const features = extractor.extract('SELECT id FROM users', plan);
      expect(features.estimatedRows).toBe(0.5);
    });

    it('should cap normalized rows at 1', () => {
      const plan: IExecutionPlan = {
        id: '1', selectType: 'SIMPLE', table: 'users',
        type: 'ALL', possibleKeys: [], keyUsed: null,
        rowsExamined: 5000000, rowsReturned: 100,
      };
      const features = extractor.extract('SELECT id FROM users', plan);
      expect(features.estimatedRows).toBe(1);
    });

    it('should return 0 when no execution plan is provided', () => {
      const features = extractor.extract('SELECT id FROM users');
      expect(features.estimatedRows).toBe(0);
    });
  });

  describe('extract - OR detection and counting', () => {
    it('should detect OR in WHERE clause', () => {
      const features = extractor.extract('SELECT id FROM users WHERE name = \'a\' OR name = \'b\'');
      expect(features.hasOr).toBe(1);
      expect(features.orConditionCount).toBe(1);
    });

    it('should count multiple OR conditions', () => {
      const features = extractor.extract('SELECT id FROM users WHERE a = 1 OR b = 2 OR c = 3');
      expect(features.hasOr).toBe(1);
      expect(features.orConditionCount).toBe(2);
    });

    it('should cap OR condition count at 5', () => {
      const features = extractor.extract(
        'SELECT id FROM users WHERE a = 1 OR b = 2 OR c = 3 OR d = 4 OR e = 5 OR f = 6 OR g = 7'
      );
      expect(features.orConditionCount).toBe(5);
    });

    it('should return 0 OR conditions when no WHERE clause', () => {
      const features = extractor.extract('SELECT id FROM users');
      expect(features.hasOr).toBe(0);
      expect(features.orConditionCount).toBe(0);
    });
  });

  describe('extract - UNION detection', () => {
    it('should detect UNION', () => {
      const features = extractor.extract('SELECT id FROM users UNION SELECT id FROM admins');
      expect(features.hasUnion).toBe(1);
    });

    it('should detect UNION ALL', () => {
      const features = extractor.extract('SELECT id FROM users UNION ALL SELECT id FROM admins');
      expect(features.hasUnion).toBe(1);
    });

    it('should not detect UNION in a regular query', () => {
      const features = extractor.extract('SELECT id FROM users');
      expect(features.hasUnion).toBe(0);
    });
  });

  describe('extract - LIKE detection', () => {
    it('should detect LIKE keyword', () => {
      const features = extractor.extract('SELECT id FROM users WHERE name LIKE \'%john%\'');
      expect(features.hasLike).toBe(1);
    });

    it('should not detect LIKE when absent', () => {
      const features = extractor.extract('SELECT id FROM users WHERE name = \'john\'');
      expect(features.hasLike).toBe(0);
    });
  });

  describe('extract - COUNT(*) detection', () => {
    it('should detect COUNT(*)', () => {
      const features = extractor.extract('SELECT COUNT(*) FROM users');
      expect(features.hasCountStar).toBe(1);
    });

    it('should detect COUNT( * ) with spaces', () => {
      const features = extractor.extract('SELECT COUNT( * ) FROM users');
      expect(features.hasCountStar).toBe(1);
    });

    it('should not detect COUNT(id) as COUNT(*)', () => {
      const features = extractor.extract('SELECT COUNT(id) FROM users');
      expect(features.hasCountStar).toBe(0);
    });
  });

  describe('extract - nested join depth', () => {
    it('should return 0 for a single JOIN', () => {
      const features = extractor.extract('SELECT u.id FROM users u JOIN orders o ON u.id = o.user_id');
      expect(features.nestedJoinDepth).toBe(0);
    });

    it('should return depth minus 1 for multiple JOINs', () => {
      const query = 'SELECT u.id FROM users u JOIN orders o ON u.id = o.user_id JOIN products p ON o.pid = p.id JOIN categories c ON p.cid = c.id';
      const features = extractor.extract(query);
      // 3 JOINs => depth = min(3-1, 3) = 2
      expect(features.nestedJoinDepth).toBe(2);
    });

    it('should cap nested join depth at 3', () => {
      const query = 'SELECT t.id FROM t JOIN a ON t.id = a.id JOIN b ON a.id = b.id JOIN c ON b.id = c.id JOIN d ON c.id = d.id JOIN e ON d.id = e.id';
      const features = extractor.extract(query);
      // 5 JOINs => depth = min(5-1, 3) = 3
      expect(features.nestedJoinDepth).toBe(3);
    });

    it('should return 0 for no JOINs', () => {
      const features = extractor.extract('SELECT id FROM users');
      expect(features.nestedJoinDepth).toBe(0);
    });
  });

  describe('extract - GROUP BY, ORDER BY, LIMIT', () => {
    it('should detect GROUP BY', () => {
      const features = extractor.extract('SELECT status, COUNT(*) FROM orders GROUP BY status');
      expect(features.hasGroupBy).toBe(1);
    });

    it('should detect ORDER BY', () => {
      const features = extractor.extract('SELECT id FROM users ORDER BY name');
      expect(features.hasOrderBy).toBe(1);
    });

    it('should detect LIMIT', () => {
      const features = extractor.extract('SELECT id FROM users LIMIT 10');
      expect(features.hasLimit).toBe(1);
    });

    it('should detect all three together', () => {
      const features = extractor.extract('SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY status LIMIT 5');
      expect(features.hasGroupBy).toBe(1);
      expect(features.hasOrderBy).toBe(1);
      expect(features.hasLimit).toBe(1);
    });
  });

  describe('toArray', () => {
    it('should return an array with 18 elements in correct order', () => {
      const features: IExtractedFeatures = {
        hasJoin: 1,
        joinCount: 2,
        hasSubquery: 1,
        subqueryCount: 3,
        hasFunctionInWhere: 0,
        selectStar: 1,
        tableCount: 4,
        whereColumnsIndexed: 1,
        estimatedRows: 0.5,
        hasOr: 1,
        hasUnion: 0,
        hasLike: 1,
        hasCountStar: 0,
        nestedJoinDepth: 2,
        hasGroupBy: 1,
        hasOrderBy: 1,
        hasLimit: 1,
        orConditionCount: 3,
      };

      const arr = extractor.toArray(features);
      expect(arr).toHaveLength(18);
      expect(arr).toEqual([1, 2, 1, 3, 0, 1, 4, 1, 0.5, 1, 0, 1, 0, 2, 1, 1, 1, 3]);
    });
  });

  describe('extractFromRecord', () => {
    it('should delegate to extract with record fields', () => {
      const executionPlan: IExecutionPlan = {
        id: '1', selectType: 'SIMPLE', table: 'users',
        type: 'ALL', possibleKeys: [], keyUsed: null,
        rowsExamined: 100000, rowsReturned: 50,
      };
      const catalogInfo: ICatalogInfo = {
        database: 'test',
        table: 'users',
        rowCount: 1000,
        avgRowLength: 100,
        indexes: [{ name: 'idx_id', columns: ['id'], isUnique: true }],
      };
      const record: ISQLQueryRecord = {
        id: '1',
        query: 'SELECT * FROM users WHERE id = 1',
        executionTimeMs: 100,
        database: 'test',
        timestamp: '2026-01-01T00:00:00Z',
        executionPlan,
        catalogInfo,
      };

      const features = extractor.extractFromRecord(record);
      expect(features.selectStar).toBe(1);
      expect(features.estimatedRows).toBe(0.1);
      expect(features.whereColumnsIndexed).toBe(1);
      expect(features.tableCount).toBe(1);
    });
  });

  describe('extract - complex query with many features', () => {
    it('should correctly extract all features from a complex query', () => {
      const query =
        "SELECT COUNT(*) FROM users u LEFT JOIN orders o ON u.id = o.user_id INNER JOIN products p ON o.product_id = p.id WHERE LOWER(u.name) LIKE '%john%' OR u.status = 'active' OR u.role = 'admin' GROUP BY u.status ORDER BY u.name LIMIT 100";
      const plan: IExecutionPlan = {
        id: '1', selectType: 'SIMPLE', table: 'users',
        type: 'ALL', possibleKeys: [], keyUsed: null,
        rowsExamined: 250000, rowsReturned: 10,
      };

      const features = extractor.extract(query, plan);

      expect(features.hasJoin).toBe(1);
      expect(features.joinCount).toBe(2);
      expect(features.hasFunctionInWhere).toBe(1);
      expect(features.hasLike).toBe(1);
      expect(features.hasOr).toBe(1);
      expect(features.orConditionCount).toBe(2);
      expect(features.hasCountStar).toBe(1);
      expect(features.hasGroupBy).toBe(1);
      expect(features.hasOrderBy).toBe(1);
      expect(features.hasLimit).toBe(1);
      expect(features.estimatedRows).toBe(0.25);
      expect(features.nestedJoinDepth).toBe(1);
      expect(features.tableCount).toBeGreaterThanOrEqual(1);
    });
  });
});
