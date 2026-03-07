import { config as dotenvConfig } from 'dotenv';
import { IConnectorConfig } from '../db/connector.js';

/**
 * Default connection values used when neither CLI flags nor env vars provide a value.
 */
const DEFAULTS: Partial<IConnectorConfig> = {
  engine: 'mysql',
  host: 'localhost',
  port: 3306,
  connectTimeout: 5000,
  queryTimeout: 10000,
  ssl: false,
};

/**
 * Maps CLI option names to IConnectorConfig fields.
 */
export interface ICLIConnectionOptions {
  host?: string;
  port?: string | number;
  user?: string;
  password?: string;
  database?: string;
  engine?: string;
  ssl?: boolean;
  connectTimeout?: string | number;
  queryTimeout?: string | number;
}

/**
 * Resolve connection configuration from CLI options, environment variables, and defaults.
 *
 * Priority order (highest wins):
 * 1. CLI flags (explicit user input)
 * 2. Environment variables (SQLML_*)
 * 3. Defaults
 *
 * Returns null if no database is specified (no connection intended).
 */
export function resolveConnectionConfig(cliOptions?: ICLIConnectionOptions): IConnectorConfig | null {
  // Load .env file (no-op if it doesn't exist)
  dotenvConfig();

  const engine = resolveString(cliOptions?.engine, process.env.SQLML_ENGINE, DEFAULTS.engine);
  const host = resolveString(cliOptions?.host, process.env.SQLML_HOST, DEFAULTS.host);
  const port = resolveNumber(cliOptions?.port, process.env.SQLML_PORT, DEFAULTS.port);
  const user = resolveString(cliOptions?.user, process.env.SQLML_USER, undefined);
  const password = resolveString(cliOptions?.password, process.env.SQLML_PASSWORD, undefined);
  const database = resolveString(cliOptions?.database, process.env.SQLML_DATABASE, undefined);
  const ssl = resolveBoolean(cliOptions?.ssl, process.env.SQLML_SSL, DEFAULTS.ssl);
  const connectTimeout = resolveNumber(cliOptions?.connectTimeout, process.env.SQLML_CONNECT_TIMEOUT, DEFAULTS.connectTimeout);
  const queryTimeout = resolveNumber(cliOptions?.queryTimeout, process.env.SQLML_QUERY_TIMEOUT, DEFAULTS.queryTimeout);

  // If no database is specified, the user doesn't intend to connect
  if (!database) {
    return null;
  }

  // User and password are required for a real connection
  if (!user) {
    throw new Error(
      'Database user is required. Provide --user flag or set SQLML_USER environment variable.'
    );
  }

  if (!password) {
    throw new Error(
      'Database password is required. Provide --password flag or set SQLML_PASSWORD environment variable.'
    );
  }

  const validEngines = ['mysql', 'mariadb', 'postgresql', 'sqlite'];
  if (!validEngines.includes(engine!)) {
    throw new Error(
      `Invalid database engine: "${engine}". Valid engines: ${validEngines.join(', ')}.`
    );
  }

  return {
    engine: engine as IConnectorConfig['engine'],
    host: host!,
    port: port!,
    user,
    password,
    database,
    ssl,
    connectTimeout,
    queryTimeout,
  };
}

/**
 * Resolve a string value from CLI, env, or default (in priority order).
 */
function resolveString(
  cli: string | undefined,
  env: string | undefined,
  fallback: string | undefined
): string | undefined {
  if (cli !== undefined && cli !== '') return cli;
  if (env !== undefined && env !== '') return env;
  return fallback;
}

/**
 * Resolve a numeric value from CLI, env, or default.
 */
function resolveNumber(
  cli: string | number | undefined,
  env: string | undefined,
  fallback: number | undefined
): number | undefined {
  if (cli !== undefined && cli !== '') {
    const n = typeof cli === 'number' ? cli : parseInt(String(cli), 10);
    if (!isNaN(n)) return n;
  }
  if (env !== undefined && env !== '') {
    const n = parseInt(env, 10);
    if (!isNaN(n)) return n;
  }
  return fallback;
}

/**
 * Resolve a boolean value from CLI, env, or default.
 */
function resolveBoolean(
  cli: boolean | undefined,
  env: string | undefined,
  fallback: boolean | undefined
): boolean | undefined {
  if (cli !== undefined) return cli;
  if (env !== undefined && env !== '') {
    return env === 'true' || env === '1';
  }
  return fallback;
}
