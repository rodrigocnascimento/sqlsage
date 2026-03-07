import { ISQLQueryRecord, IExecutionPlan, ICatalogInfo } from '../data/types.js';
import { MysqlConnector } from './mysql-connector.js';

/**
 * Configuration for collecting queries from a live database.
 */
export interface ICollectOptions {
  database?: string;
  minExecutionTimeMs?: number;
  limit?: number;
  since?: Date;
}

/**
 * Connection configuration for a database connector.
 * Supports multiple engines via the `engine` discriminator.
 */
export interface IConnectorConfig {
  engine: 'mysql' | 'mariadb' | 'postgresql' | 'sqlite';
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
  connectTimeout?: number;
  queryTimeout?: number;
}

/**
 * Abstract interface for database connectors.
 * Implement this interface to add support for a new database engine.
 *
 * All connectors must provide:
 * - Lifecycle management (connect/disconnect)
 * - EXPLAIN execution
 * - Catalog info gathering (INFORMATION_SCHEMA or equivalent)
 * - Live query collection (performance_schema or equivalent)
 */
export interface IDatabaseConnector {
  /** The engine identifier (e.g. 'mysql', 'postgresql') */
  readonly engine: string;

  /** The configured database name */
  readonly database: string;

  /** Establish a connection to the database */
  connect(): Promise<void>;

  /** Close the database connection */
  disconnect(): Promise<void>;

  /** Check if the connector is currently connected */
  isConnected(): boolean;

  /** Run EXPLAIN on a query and return parsed execution plans */
  explain(query: string): Promise<IExecutionPlan[]>;

  /** Gather catalog info (row count, indexes) for a specific table */
  getCatalogInfo(database: string, table: string): Promise<ICatalogInfo>;

  /** List all tables in a database */
  getTablesInDatabase(database: string): Promise<string[]>;

  /** Collect recent queries from the database's performance instrumentation */
  collectRecentQueries(options: ICollectOptions): Promise<ISQLQueryRecord[]>;
}

/**
 * Factory function to create a database connector based on the engine type.
 * Throws if the engine is not supported.
 *
 * To add a new engine:
 * 1. Create a class implementing IDatabaseConnector
 * 2. Add a case to this factory
 */
export function createConnector(config: IConnectorConfig): IDatabaseConnector {
  switch (config.engine) {
    case 'mysql':
    case 'mariadb': {
      return new MysqlConnector(config);
    }
    default:
      throw new Error(
        `Unsupported database engine: "${config.engine}". ` +
        `Supported engines: mysql, mariadb.`
      );
  }
}
