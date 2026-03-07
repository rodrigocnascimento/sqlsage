import { describe, it, expect, beforeEach } from 'vitest';
import { CatalogGatherer } from './catalog-gatherer.js';

describe('CatalogGatherer', () => {
  let gatherer: CatalogGatherer;

  beforeEach(() => {
    gatherer = new CatalogGatherer();
  });

  describe('setConfig()', () => {
    it('should accept a config without error', () => {
      expect(() =>
        gatherer.setConfig({ host: 'localhost', port: 5432, user: 'admin', password: 'secret', database: 'testdb' })
      ).not.toThrow();
    });

    it('should accept a config with only the required database field', () => {
      expect(() => gatherer.setConfig({ database: 'testdb' })).not.toThrow();
    });
  });

  describe('gather() - mock mode (no connector)', () => {
    it('should return 3 default tables when no tableName is given', async () => {
      const results = await gatherer.gather('mydb');
      expect(results).toHaveLength(3);
    });

    it('should return 1 entry when a specific tableName is given', async () => {
      const results = await gatherer.gather('mydb', 'orders');
      expect(results).toHaveLength(1);
    });

    it('should set the correct database field on each result', async () => {
      const results = await gatherer.gather('mydb');
      for (const entry of results) {
        expect(entry.database).toBe('mydb');
      }
    });

    it('should set the correct table field on each result', async () => {
      const results = await gatherer.gather('mydb');
      const tableNames = results.map(r => r.table);
      expect(tableNames).toEqual(['users', 'orders', 'products']);
    });

    it('should return 1 index for the users table (id pk)', async () => {
      const results = await gatherer.gather('mydb', 'users');
      expect(results[0].indexes).toHaveLength(1);
      expect(results[0].indexes[0].name).toBe('users_id_pk');
      expect(results[0].indexes[0].isUnique).toBe(true);
    });

    it('should return 3 indexes for the orders table', async () => {
      const results = await gatherer.gather('mydb', 'orders');
      expect(results[0].indexes).toHaveLength(3);
      const indexNames = results[0].indexes.map(i => i.name);
      expect(indexNames).toEqual(['orders_id_pk', 'orders_user_id_idx', 'orders_created_idx']);
    });

    it('should return 2 indexes for the products table', async () => {
      const results = await gatherer.gather('mydb', 'products');
      expect(results[0].indexes).toHaveLength(2);
      const indexNames = results[0].indexes.map(i => i.name);
      expect(indexNames).toEqual(['products_id_pk', 'products_category_idx']);
    });

    it('should return 1 index and rowCount 1000 for an unknown table', async () => {
      const results = await gatherer.gather('mydb', 'unknown_table');
      expect(results[0].indexes).toHaveLength(1);
      expect(results[0].indexes[0].name).toBe('unknown_table_id_pk');
      expect(results[0].rowCount).toBe(1000);
    });

    it('should return correct rowCounts for known tables', async () => {
      const results = await gatherer.gather('mydb');
      const counts: Record<string, number> = {};
      for (const r of results) {
        counts[r.table] = r.rowCount;
      }
      expect(counts['users']).toBe(10000);
      expect(counts['orders']).toBe(50000);
      expect(counts['products']).toBe(5000);
    });

    it('should produce an avgRowLength between 50 and 249', async () => {
      const results = await gatherer.gather('mydb');
      for (const entry of results) {
        expect(entry.avgRowLength).toBeGreaterThanOrEqual(50);
        expect(entry.avgRowLength).toBeLessThanOrEqual(249);
      }
    });
  });

  describe('gatherMock() - synchronous backward compat', () => {
    it('should return 3 default tables synchronously', () => {
      const results = gatherer.gatherMock('mydb');
      expect(results).toHaveLength(3);
    });

    it('should return 1 entry for a specific table synchronously', () => {
      const results = gatherer.gatherMock('mydb', 'users');
      expect(results).toHaveLength(1);
      expect(results[0].table).toBe('users');
    });
  });

  describe('getIndexesForTable()', () => {
    it('should return indexes for the specified table', async () => {
      const indexes = await gatherer.getIndexesForTable('mydb', 'orders');
      expect(indexes).toHaveLength(3);
      expect(indexes.map(i => i.name)).toContain('orders_user_id_idx');
    });

    it('should always include an id pk index for any table', async () => {
      const indexes = await gatherer.getIndexesForTable('mydb', 'some_table');
      expect(indexes.length).toBeGreaterThanOrEqual(1);
      expect(indexes[0].name).toBe('some_table_id_pk');
      expect(indexes[0].isUnique).toBe(true);
      expect(indexes[0].columns).toEqual(['id']);
    });
  });

  describe('isColumnIndexed()', () => {
    it('should return true for the id column on any table', async () => {
      expect(await gatherer.isColumnIndexed('mydb', 'users', 'id')).toBe(true);
      expect(await gatherer.isColumnIndexed('mydb', 'orders', 'id')).toBe(true);
      expect(await gatherer.isColumnIndexed('mydb', 'anything', 'id')).toBe(true);
    });

    it('should return true for user_id on the orders table', async () => {
      expect(await gatherer.isColumnIndexed('mydb', 'orders', 'user_id')).toBe(true);
    });

    it('should return false for a non-indexed column', async () => {
      expect(await gatherer.isColumnIndexed('mydb', 'users', 'email')).toBe(false);
    });

    it('should return true for category_id on the products table', async () => {
      expect(await gatherer.isColumnIndexed('mydb', 'products', 'category_id')).toBe(true);
    });
  });

  describe('setConnector()', () => {
    it('should accept a null connector', () => {
      expect(() => gatherer.setConnector(null)).not.toThrow();
    });

    it('should fall back to mock when connector is null', async () => {
      gatherer.setConnector(null);
      const results = await gatherer.gather('mydb');
      expect(results).toHaveLength(3);
    });
  });
});
