# TDD: Real Database Connector (Plugin Architecture)

**Issue:** ISSUE-050
**Branch:** `feat/ISSUE-050-real-db-connector`
**Target version:** 0.5.0

---

## 1. Objective & Scope

### What
Introduce a pluggable database connector layer that enables the CLI to connect to a real MySQL/MariaDB instance, run `EXPLAIN`, gather catalog info (`INFORMATION_SCHEMA`), and optionally collect queries from `performance_schema.events_statements_summary_by_digest`. The architecture uses an interface-based plugin pattern so new database engines (PostgreSQL, SQLite, etc.) can be added by implementing `IDatabaseConnector` without modifying the core pipeline.

### Why
- Two of the 18 ML features (`estimatedRows`, `whereColumnsIndexed`) are **dead** -- always 0 -- because no execution plan or catalog data is ever provided. A real connection unlocks these features.
- The `ExplainParser` and `CatalogGatherer` already exist but have no data source. This bridges the gap.
- The slow log parser only works with offline log files. A real connection enables live query collection from `performance_schema`.
- Pluggable design avoids coupling the core pipeline to MySQL-specific code.

### Scope
- All three data commands: `collect`, `features`, `analyze`
- MySQL/MariaDB as the first connector implementation
- Connection config via CLI flags + `.env` file
- Connector interface designed for future database plugins

---

## 2. Proposed Technical Strategy

### 2.1 Connector Interface (`IDatabaseConnector`)

```typescript
export interface IDatabaseConnector {
  readonly engine: string;

  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // EXPLAIN
  explain(query: string): Promise<IExecutionPlan[]>;

  // Catalog
  getCatalogInfo(database: string, table: string): Promise<ICatalogInfo>;
  getTablesInDatabase(database: string): Promise<string[]>;

  // Live query collection
  collectRecentQueries(options: ICollectOptions): Promise<ISQLQueryRecord[]>;
}

export interface ICollectOptions {
  database?: string;
  minExecutionTimeMs?: number;
  limit?: number;
  since?: Date;
}

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
```

### 2.2 MySQL Connector (`MysqlConnector`)

Uses `mysql2/promise`. Maps existing interfaces:

| Method | MySQL Query |
|---|---|
| `explain(query)` | `EXPLAIN <query>` -> `ExplainParser.parse()` per row |
| `getCatalogInfo(db, table)` | `INFORMATION_SCHEMA.TABLES` + `INFORMATION_SCHEMA.STATISTICS` |
| `getTablesInDatabase(db)` | `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?` |
| `collectRecentQueries(opts)` | `performance_schema.events_statements_summary_by_digest` |

### 2.3 Connector Factory

```typescript
export function createConnector(config: IConnectorConfig): IDatabaseConnector {
  switch (config.engine) {
    case 'mysql':
    case 'mariadb':
      return new MysqlConnector(config);
    default:
      throw new Error(`Unsupported database engine: ${config.engine}`);
  }
}
```

### 2.4 Config Management

Resolution order (higher priority wins):
1. CLI flags (`--host`, `--port`, `--user`, `--password`, `--database`, `--engine`)
2. `.env` file in project root (via `dotenv`)
3. Defaults: `host=localhost`, `port=3306`, `engine=mysql`

Env vars: `SQLML_HOST`, `SQLML_PORT`, `SQLML_USER`, `SQLML_PASSWORD`, `SQLML_DATABASE`, `SQLML_ENGINE`

### 2.5 Command Integration

| Command | Current | New |
|---|---|---|
| `collect` | Parses slow log files or `--query` | New `--source db` mode: connects, queries `performance_schema`, enriches records with EXPLAIN + catalog |
| `features` | Extracts features from JSONL | No changes needed -- `extractFromRecord()` already reads `executionPlan`/`catalogInfo` if present |
| `analyze` | Heuristic + ML on SQL string only | New `--db` flag: connects, runs EXPLAIN, gathers catalog, passes enriched data to engine |
| `status` | Shows engine stats | Adds connector status |

### 2.6 Impacted Files

| File | Change |
|---|---|
| `src/services/db/connector.ts` | **NEW** -- Interface + factory |
| `src/services/db/mysql-connector.ts` | **NEW** -- MySQL implementation |
| `src/services/config/connection-config.ts` | **NEW** -- Config loader |
| `.env.example` | **NEW** -- Template |
| `src/services/ml/engine/catalog-gatherer.ts` | **MODIFIED** -- Accept optional connector |
| `src/services/data/query-collector.ts` | **MODIFIED** -- Add `--source db` path |
| `src/index.ts` | **MODIFIED** -- Add DB flags, wire connector |
| `src/services/ml-prediction.service.ts` | **MODIFIED** -- Accept optional connector for live EXPLAIN |
| `package.json` | **MODIFIED** -- Add `mysql2`, `dotenv` |

### 2.7 Guardrails

- **Type Safety:** All DB results typed through existing `IExecutionPlan`/`ICatalogInfo`. No `any`.
- **Error Handling:** Connection failures degrade gracefully to offline mode with warning.
- **Credential Safety:** `.env` in `.gitignore`. Passwords never logged.
- **Connection lifecycle:** Auto-disconnect on process exit. Configurable timeouts (5s connect, 10s query default).

---

## 3. Implementation Plan

### Phase 1: Foundation
- `src/services/db/connector.ts` -- `IDatabaseConnector`, `IConnectorConfig`, `ICollectOptions`, `createConnector()`
- `src/services/config/connection-config.ts` -- `resolveConnectionConfig()`
- `.env.example` -- Template with all `SQLML_*` vars

### Phase 2: MySQL Connector
- `src/services/db/mysql-connector.ts` -- Full `MysqlConnector` implementation
- `package.json` -- Add `mysql2`, `dotenv`

### Phase 3: CLI Integration
- `src/index.ts` -- Global DB flags, wire connector into `collect`, `analyze`, `status`
- `src/services/data/query-collector.ts` -- Add `--source db` path

### Phase 4: CatalogGatherer Refactor
- `src/services/ml/engine/catalog-gatherer.ts` -- Accept connector, keep mock fallback

### Phase 5: Tests
- Unit tests for connector interface, config loader, MySQL connector (mocked mysql2)
- Verify all existing 262 tests still pass
