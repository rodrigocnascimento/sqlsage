import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MysqlConnector } from './mysql-connector.js';
import { IConnectorConfig } from './connector.js';

// Use vi.hoisted so these are available when vi.mock factory runs (hoisted to top)
const { mockConnection, mockCreateConnection } = vi.hoisted(() => {
  const mockConnection = {
    query: vi.fn(),
    end: vi.fn(),
  };
  const mockCreateConnection = vi.fn().mockResolvedValue(mockConnection);
  return { mockConnection, mockCreateConnection };
});

vi.mock('mysql2/promise', () => {
  return {
    default: {
      createConnection: mockCreateConnection,
    },
  };
});

describe('MysqlConnector', () => {
  const config: IConnectorConfig = {
    engine: 'mysql',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'secret',
    database: 'testdb',
    connectTimeout: 5000,
  };

  let connector: MysqlConnector;

  beforeEach(async () => {
    connector = new MysqlConnector(config);
    mockConnection.query.mockReset();
    mockConnection.end.mockReset();
    mockConnection.end.mockResolvedValue(undefined);
    mockCreateConnection.mockClear();
    mockCreateConnection.mockResolvedValue(mockConnection);
  });

  describe('constructor', () => {
    it('should set the engine property', () => {
      expect(connector.engine).toBe('mysql');
    });

    it('should set the database property', () => {
      expect(connector.database).toBe('testdb');
    });

    it('should set engine to "mariadb" for mariadb config', () => {
      const mariaConnector = new MysqlConnector({ ...config, engine: 'mariadb' });
      expect(mariaConnector.engine).toBe('mariadb');
    });
  });

  describe('connect()', () => {
    it('should establish a connection', async () => {
      expect(connector.isConnected()).toBe(false);
      await connector.connect();
      expect(connector.isConnected()).toBe(true);
    });

    it('should be a no-op if already connected', async () => {
      await connector.connect();
      await connector.connect();
      expect(mockCreateConnection).toHaveBeenCalledTimes(1);
    });

    it('should throw on connection failure', async () => {
      mockCreateConnection.mockRejectedValueOnce(
        new Error('ECONNREFUSED')
      );

      const failConnector = new MysqlConnector(config);
      await expect(failConnector.connect()).rejects.toThrow('Connection failed: ECONNREFUSED');
    });
  });

  describe('disconnect()', () => {
    it('should close the connection', async () => {
      await connector.connect();
      expect(connector.isConnected()).toBe(true);
      await connector.disconnect();
      expect(connector.isConnected()).toBe(false);
    });

    it('should be a no-op if not connected', async () => {
      await connector.disconnect(); // should not throw
      expect(connector.isConnected()).toBe(false);
    });

    it('should handle disconnect errors gracefully', async () => {
      const mockConn = mockConnection;
      mockConn.end.mockRejectedValueOnce(new Error('disconnect error'));

      await connector.connect();
      await connector.disconnect(); // should not throw
      expect(connector.isConnected()).toBe(false);
    });
  });

  describe('isConnected()', () => {
    it('should return false before connect', () => {
      expect(connector.isConnected()).toBe(false);
    });

    it('should return true after connect', async () => {
      await connector.connect();
      expect(connector.isConnected()).toBe(true);
    });

    it('should return false after disconnect', async () => {
      await connector.connect();
      await connector.disconnect();
      expect(connector.isConnected()).toBe(false);
    });
  });

  describe('explain()', () => {
    it('should throw if not connected', async () => {
      await expect(connector.explain('SELECT 1')).rejects.toThrow('Not connected');
    });

    it('should execute EXPLAIN and parse results', async () => {
      const mockConn = mockConnection;
      mockConn.query.mockResolvedValueOnce([
        [
          {
            id: 1,
            select_type: 'SIMPLE',
            table: 'users',
            type: 'ALL',
            possible_keys: null,
            key: null,
            rows: 10000,
            Extra: null,
          },
        ],
      ]);

      await connector.connect();
      const plans = await connector.explain('SELECT * FROM users');

      expect(plans).toHaveLength(1);
      expect(plans[0].table).toBe('users');
      expect(plans[0].selectType).toBe('SIMPLE');
      expect(mockConn.query).toHaveBeenCalledWith('EXPLAIN SELECT * FROM users');
    });

    it('should return empty array on EXPLAIN failure', async () => {
      const mockConn = mockConnection;
      mockConn.query.mockRejectedValueOnce(new Error('syntax error'));

      await connector.connect();
      const plans = await connector.explain('INVALID SQL');

      expect(plans).toEqual([]);
    });
  });

  describe('getCatalogInfo()', () => {
    it('should throw if not connected', async () => {
      await expect(connector.getCatalogInfo('testdb', 'users')).rejects.toThrow('Not connected');
    });

    it('should query INFORMATION_SCHEMA for table stats and indexes', async () => {
      const mockConn = mockConnection;

      // First query: TABLE_ROWS, AVG_ROW_LENGTH
      mockConn.query.mockResolvedValueOnce([
        [{ TABLE_ROWS: 5000, AVG_ROW_LENGTH: 120 }],
      ]);

      // Second query: indexes
      mockConn.query.mockResolvedValueOnce([
        [
          { INDEX_NAME: 'PRIMARY', COLUMN_NAME: 'id', NON_UNIQUE: 0, SEQ_IN_INDEX: 1 },
          { INDEX_NAME: 'idx_email', COLUMN_NAME: 'email', NON_UNIQUE: 1, SEQ_IN_INDEX: 1 },
        ],
      ]);

      await connector.connect();
      const catalog = await connector.getCatalogInfo('testdb', 'users');

      expect(catalog.database).toBe('testdb');
      expect(catalog.table).toBe('users');
      expect(catalog.rowCount).toBe(5000);
      expect(catalog.avgRowLength).toBe(120);
      expect(catalog.indexes).toHaveLength(2);
      expect(catalog.indexes[0].name).toBe('PRIMARY');
      expect(catalog.indexes[0].isUnique).toBe(true);
      expect(catalog.indexes[1].name).toBe('idx_email');
      expect(catalog.indexes[1].isUnique).toBe(false);
    });

    it('should handle table with no stats', async () => {
      const mockConn = mockConnection;
      mockConn.query.mockResolvedValueOnce([[]]);
      mockConn.query.mockResolvedValueOnce([[]]);

      await connector.connect();
      const catalog = await connector.getCatalogInfo('testdb', 'nonexistent');

      expect(catalog.rowCount).toBe(0);
      expect(catalog.avgRowLength).toBe(0);
      expect(catalog.indexes).toEqual([]);
    });

    it('should group multi-column indexes correctly', async () => {
      const mockConn = mockConnection;
      mockConn.query.mockResolvedValueOnce([
        [{ TABLE_ROWS: 1000, AVG_ROW_LENGTH: 80 }],
      ]);
      mockConn.query.mockResolvedValueOnce([
        [
          { INDEX_NAME: 'idx_composite', COLUMN_NAME: 'first_name', NON_UNIQUE: 1, SEQ_IN_INDEX: 1 },
          { INDEX_NAME: 'idx_composite', COLUMN_NAME: 'last_name', NON_UNIQUE: 1, SEQ_IN_INDEX: 2 },
        ],
      ]);

      await connector.connect();
      const catalog = await connector.getCatalogInfo('testdb', 'users');

      expect(catalog.indexes).toHaveLength(1);
      expect(catalog.indexes[0].name).toBe('idx_composite');
      expect(catalog.indexes[0].columns).toEqual(['first_name', 'last_name']);
      expect(catalog.indexes[0].isUnique).toBe(false);
    });
  });

  describe('getTablesInDatabase()', () => {
    it('should throw if not connected', async () => {
      await expect(connector.getTablesInDatabase('testdb')).rejects.toThrow('Not connected');
    });

    it('should return list of table names', async () => {
      const mockConn = mockConnection;
      mockConn.query.mockResolvedValueOnce([
        [
          { TABLE_NAME: 'orders' },
          { TABLE_NAME: 'products' },
          { TABLE_NAME: 'users' },
        ],
      ]);

      await connector.connect();
      const tables = await connector.getTablesInDatabase('testdb');

      expect(tables).toEqual(['orders', 'products', 'users']);
    });

    it('should return empty array when no tables exist', async () => {
      const mockConn = mockConnection;
      mockConn.query.mockResolvedValueOnce([[]]);

      await connector.connect();
      const tables = await connector.getTablesInDatabase('emptydb');

      expect(tables).toEqual([]);
    });
  });

  describe('collectRecentQueries()', () => {
    it('should throw if not connected', async () => {
      await expect(connector.collectRecentQueries({})).rejects.toThrow('Not connected');
    });

    it('should query performance_schema and return records', async () => {
      const mockConn = mockConnection;
      mockConn.query.mockResolvedValueOnce([
        [
          {
            id: 'abc123def456',
            query: 'SELECT * FROM users WHERE id = ?',
            executionTimeMs: 12.5,
            database: 'testdb',
            timestamp: '2026-03-06 10:00:00',
          },
        ],
      ]);

      await connector.connect();
      const records = await connector.collectRecentQueries({ database: 'testdb' });

      expect(records).toHaveLength(1);
      expect(records[0].query).toBe('SELECT * FROM users WHERE id = ?');
      expect(records[0].executionTimeMs).toBe(12.5);
      expect(records[0].database).toBe('testdb');
    });

    it('should return empty array on performance_schema error', async () => {
      const mockConn = mockConnection;
      mockConn.query.mockRejectedValueOnce(new Error('Access denied'));

      await connector.connect();
      const records = await connector.collectRecentQueries({});

      expect(records).toEqual([]);
    });

    it('should apply limit option', async () => {
      const mockConn = mockConnection;
      mockConn.query.mockResolvedValueOnce([[]]);

      await connector.connect();
      await connector.collectRecentQueries({ limit: 50 });

      const queryCall = mockConn.query.mock.calls[0][0] as string;
      expect(queryCall).toContain('LIMIT 50');
    });

    it('should apply minExecutionTimeMs filter', async () => {
      const mockConn = mockConnection;
      mockConn.query.mockResolvedValueOnce([[]]);

      await connector.connect();
      await connector.collectRecentQueries({ minExecutionTimeMs: 100 });

      const queryCall = mockConn.query.mock.calls[0][0] as string;
      expect(queryCall).toContain('SUM_TIMER_WAIT / 1000000000 >= ?');
    });

    it('should apply database filter', async () => {
      const mockConn = mockConnection;
      mockConn.query.mockResolvedValueOnce([[]]);

      await connector.connect();
      await connector.collectRecentQueries({ database: 'mydb' });

      const queryCall = mockConn.query.mock.calls[0][0] as string;
      expect(queryCall).toContain('SCHEMA_NAME = ?');
    });
  });
});
