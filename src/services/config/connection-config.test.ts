import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveConnectionConfig, ICLIConnectionOptions } from './connection-config.js';

describe('connection-config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env for each test
    process.env = { ...originalEnv };
    // Clear any SQLML_ vars from parent env
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('SQLML_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolveConnectionConfig()', () => {
    it('should return null when no database is specified', () => {
      const result = resolveConnectionConfig();
      expect(result).toBeNull();
    });

    it('should return null when CLI options have no database', () => {
      const result = resolveConnectionConfig({ host: 'localhost' });
      expect(result).toBeNull();
    });

    it('should throw when database is set but user is missing', () => {
      expect(() =>
        resolveConnectionConfig({ database: 'mydb', password: 'secret' })
      ).toThrow('Database user is required');
    });

    it('should throw when database and user are set but password is missing', () => {
      expect(() =>
        resolveConnectionConfig({ database: 'mydb', user: 'root' })
      ).toThrow('Database password is required');
    });

    it('should throw for invalid engine', () => {
      expect(() =>
        resolveConnectionConfig({ database: 'mydb', user: 'root', password: 'secret', engine: 'oracle' })
      ).toThrow('Invalid database engine: "oracle"');
    });

    it('should return a valid config when all required fields are provided via CLI', () => {
      const result = resolveConnectionConfig({
        database: 'mydb',
        user: 'root',
        password: 'secret',
      });
      expect(result).not.toBeNull();
      expect(result!.database).toBe('mydb');
      expect(result!.user).toBe('root');
      expect(result!.password).toBe('secret');
    });

    it('should use defaults for host, port, engine when not specified', () => {
      const result = resolveConnectionConfig({
        database: 'mydb',
        user: 'root',
        password: 'secret',
      });
      expect(result!.host).toBe('localhost');
      expect(result!.port).toBe(3306);
      expect(result!.engine).toBe('mysql');
    });

    it('should allow CLI to override defaults', () => {
      const result = resolveConnectionConfig({
        database: 'mydb',
        user: 'root',
        password: 'secret',
        host: '10.0.0.1',
        port: '3307',
        engine: 'mariadb',
      });
      expect(result!.host).toBe('10.0.0.1');
      expect(result!.port).toBe(3307);
      expect(result!.engine).toBe('mariadb');
    });

    it('should accept numeric port from CLI', () => {
      const result = resolveConnectionConfig({
        database: 'mydb',
        user: 'root',
        password: 'secret',
        port: 5432,
      });
      expect(result!.port).toBe(5432);
    });

    it('should set ssl to false by default', () => {
      const result = resolveConnectionConfig({
        database: 'mydb',
        user: 'root',
        password: 'secret',
      });
      expect(result!.ssl).toBe(false);
    });

    it('should allow ssl to be enabled via CLI', () => {
      const result = resolveConnectionConfig({
        database: 'mydb',
        user: 'root',
        password: 'secret',
        ssl: true,
      });
      expect(result!.ssl).toBe(true);
    });

    it('should set default timeouts', () => {
      const result = resolveConnectionConfig({
        database: 'mydb',
        user: 'root',
        password: 'secret',
      });
      expect(result!.connectTimeout).toBe(5000);
      expect(result!.queryTimeout).toBe(10000);
    });

    it('should allow custom timeouts via CLI', () => {
      const result = resolveConnectionConfig({
        database: 'mydb',
        user: 'root',
        password: 'secret',
        connectTimeout: '15000',
        queryTimeout: '30000',
      });
      expect(result!.connectTimeout).toBe(15000);
      expect(result!.queryTimeout).toBe(30000);
    });
  });

  describe('environment variable resolution', () => {
    it('should resolve database from SQLML_DATABASE env var', () => {
      process.env.SQLML_DATABASE = 'envdb';
      process.env.SQLML_USER = 'envuser';
      process.env.SQLML_PASSWORD = 'envpass';

      const result = resolveConnectionConfig();
      expect(result).not.toBeNull();
      expect(result!.database).toBe('envdb');
      expect(result!.user).toBe('envuser');
    });

    it('should resolve host and port from env vars', () => {
      process.env.SQLML_DATABASE = 'envdb';
      process.env.SQLML_USER = 'envuser';
      process.env.SQLML_PASSWORD = 'envpass';
      process.env.SQLML_HOST = '192.168.1.1';
      process.env.SQLML_PORT = '3307';

      const result = resolveConnectionConfig();
      expect(result!.host).toBe('192.168.1.1');
      expect(result!.port).toBe(3307);
    });

    it('should resolve engine from SQLML_ENGINE env var', () => {
      process.env.SQLML_DATABASE = 'envdb';
      process.env.SQLML_USER = 'envuser';
      process.env.SQLML_PASSWORD = 'envpass';
      process.env.SQLML_ENGINE = 'mariadb';

      const result = resolveConnectionConfig();
      expect(result!.engine).toBe('mariadb');
    });

    it('should resolve ssl from SQLML_SSL env var', () => {
      process.env.SQLML_DATABASE = 'envdb';
      process.env.SQLML_USER = 'envuser';
      process.env.SQLML_PASSWORD = 'envpass';
      process.env.SQLML_SSL = 'true';

      const result = resolveConnectionConfig();
      expect(result!.ssl).toBe(true);
    });

    it('should resolve ssl=false from SQLML_SSL="0"', () => {
      process.env.SQLML_DATABASE = 'envdb';
      process.env.SQLML_USER = 'envuser';
      process.env.SQLML_PASSWORD = 'envpass';
      process.env.SQLML_SSL = '0';

      const result = resolveConnectionConfig();
      expect(result!.ssl).toBe(false);
    });
  });

  describe('priority: CLI > env > defaults', () => {
    it('CLI flags should override env vars', () => {
      process.env.SQLML_DATABASE = 'envdb';
      process.env.SQLML_USER = 'envuser';
      process.env.SQLML_PASSWORD = 'envpass';
      process.env.SQLML_HOST = 'envhost';

      const result = resolveConnectionConfig({
        database: 'clidb',
        user: 'cliuser',
        password: 'clipass',
        host: 'clihost',
      });

      expect(result!.database).toBe('clidb');
      expect(result!.user).toBe('cliuser');
      expect(result!.password).toBe('clipass');
      expect(result!.host).toBe('clihost');
    });

    it('env vars should override defaults', () => {
      process.env.SQLML_DATABASE = 'envdb';
      process.env.SQLML_USER = 'envuser';
      process.env.SQLML_PASSWORD = 'envpass';
      process.env.SQLML_HOST = 'envhost';
      process.env.SQLML_PORT = '5555';

      const result = resolveConnectionConfig();

      expect(result!.host).toBe('envhost');
      expect(result!.port).toBe(5555);
    });

    it('defaults should apply when CLI and env are both absent', () => {
      process.env.SQLML_DATABASE = 'envdb';
      process.env.SQLML_USER = 'envuser';
      process.env.SQLML_PASSWORD = 'envpass';

      const result = resolveConnectionConfig();

      expect(result!.host).toBe('localhost');
      expect(result!.port).toBe(3306);
      expect(result!.engine).toBe('mysql');
    });
  });

  describe('valid engine values', () => {
    const requiredOpts: ICLIConnectionOptions = {
      database: 'mydb',
      user: 'root',
      password: 'secret',
    };

    it('should accept "mysql"', () => {
      const result = resolveConnectionConfig({ ...requiredOpts, engine: 'mysql' });
      expect(result!.engine).toBe('mysql');
    });

    it('should accept "mariadb"', () => {
      const result = resolveConnectionConfig({ ...requiredOpts, engine: 'mariadb' });
      expect(result!.engine).toBe('mariadb');
    });

    it('should accept "postgresql"', () => {
      const result = resolveConnectionConfig({ ...requiredOpts, engine: 'postgresql' });
      expect(result!.engine).toBe('postgresql');
    });

    it('should accept "sqlite"', () => {
      const result = resolveConnectionConfig({ ...requiredOpts, engine: 'sqlite' });
      expect(result!.engine).toBe('sqlite');
    });

    it('should reject unknown engine', () => {
      expect(() =>
        resolveConnectionConfig({ ...requiredOpts, engine: 'mongodb' })
      ).toThrow('Invalid database engine');
    });
  });
});
