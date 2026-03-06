# SchemaRegistry

## Visão Geral

Mantém um registro das definições de tabelas (DDL) para fornecer contexto de schema ao sistema. Permite identificar colunas indexadas e sugerir melhorias de indexing.

## Modelo Mental

```
DDL String → Parser → Map<Tabela, {colunas, indexes, primaryKey}>
```

## Funcionalidades

### Registro de Tabelas

Recebe DDL SQL e extrai:
- Nome da tabela
- Colunas
- Primary Key
- Índices (KEY, INDEX, UNIQUE KEY)

### Verificação de Índice

```typescript
registry.isIndexed('users', 'email') // true/false
```

## DDL Suportados

| Sintaxe | Suportado |
|---------|-----------|
| `CREATE TABLE ...` | ✅ |
| `CREATE TABLE IF NOT EXISTS ...` | ✅ |
| `PRIMARY KEY (col)` | ✅ |
| `INDEX idx (col)` | ✅ |
| `KEY idx (col)` | ✅ |
| `UNIQUE KEY ...` | ✅ |
| Backticks (`` `table` ``) | ✅ |

## Uso

```typescript
const registry = new SchemaRegistry();
registry.registerTable('CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100), INDEX idx_name (name))');

registry.isIndexed('users', 'id')    // true (PK)
registry.isIndexed('users', 'name')  // true (INDEX)
registry.isIndexed('users', 'email') // false

registry.getStats().tableCount // 1
```
