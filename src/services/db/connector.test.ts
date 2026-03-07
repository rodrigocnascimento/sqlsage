import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createConnector, IConnectorConfig, IDatabaseConnector } from './connector.js';

// Mock mysql2/promise so MysqlConnector can be instantiated without a real DB
vi.mock('mysql2/promise', () => {
  const mockConnection = {
    query: vi.fn(),
    end: vi.fn(),
  };
  return {
    default: {
      createConnection: vi.fn().mockResolvedValue(mockConnection),
    },
  };
});

describe('connector', () => {
  const baseConfig: IConnectorConfig = {
    engine: 'mysql',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'secret',
    database: 'testdb',
  };

  describe('createConnector()', () => {
    it('should create a MysqlConnector for engine "mysql"', () => {
      const connector = createConnector({ ...baseConfig, engine: 'mysql' });
      expect(connector).toBeDefined();
      expect(connector.engine).toBe('mysql');
      expect(connector.database).toBe('testdb');
    });

    it('should create a MysqlConnector for engine "mariadb"', () => {
      const connector = createConnector({ ...baseConfig, engine: 'mariadb' });
      expect(connector).toBeDefined();
      expect(connector.engine).toBe('mariadb');
    });

    it('should throw for unsupported engine "postgresql"', () => {
      expect(() => createConnector({ ...baseConfig, engine: 'postgresql' })).toThrow(
        'Unsupported database engine: "postgresql"'
      );
    });

    it('should throw for unsupported engine "sqlite"', () => {
      expect(() => createConnector({ ...baseConfig, engine: 'sqlite' })).toThrow(
        'Unsupported database engine: "sqlite"'
      );
    });

    it('should list supported engines in error message', () => {
      expect(() => createConnector({ ...baseConfig, engine: 'sqlite' })).toThrow(
        'Supported engines: mysql, mariadb'
      );
    });
  });

  describe('IDatabaseConnector interface', () => {
    it('should return the correct database property', () => {
      const connector = createConnector(baseConfig);
      expect(connector.database).toBe('testdb');
    });

    it('should have isConnected() returning false before connect()', () => {
      const connector = createConnector(baseConfig);
      expect(connector.isConnected()).toBe(false);
    });

    it('should expose all required methods', () => {
      const connector = createConnector(baseConfig);
      expect(typeof connector.connect).toBe('function');
      expect(typeof connector.disconnect).toBe('function');
      expect(typeof connector.isConnected).toBe('function');
      expect(typeof connector.explain).toBe('function');
      expect(typeof connector.getCatalogInfo).toBe('function');
      expect(typeof connector.getTablesInDatabase).toBe('function');
      expect(typeof connector.collectRecentQueries).toBe('function');
    });
  });

  describe('IConnectorConfig', () => {
    it('should accept optional ssl, connectTimeout, queryTimeout', () => {
      const config: IConnectorConfig = {
        ...baseConfig,
        ssl: true,
        connectTimeout: 10000,
        queryTimeout: 30000,
      };
      const connector = createConnector(config);
      expect(connector).toBeDefined();
    });
  });
});
