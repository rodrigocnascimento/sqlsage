# MLQueryEngine

## Visão Geral

Orquestrador central que coordena FeatureEngineer, SchemaRegistry e Model. Abstrai a complexidade dos componentes internos e expõe uma API simples.

## Modelo Mental

```
SQL Query → [SchemaRegistry + FeatureEngineer] → Vector → [Model] → Prediction
```

## Componentes

- **SchemaRegistry**: Contexto de schema
- **FeatureEngineer**: Extração de features
- **Model**: Predição TensorFlow.js

## API

### start()
Inicializa o modelo TensorFlow.js.

### processQuery(sql)
```typescript
const result = await engine.processQuery('SELECT * FROM users');
result.performanceScore  // 0.0 - 1.0
result.insights          // Array de ISQLInsight
```

### getStats()
Retorna estatísticas de uso:
- `queriesAnalyzed`: Total de queries processadas
- `trainingSessions`: Sessões de treino
- `schemasLearned`: Tabelas registradas

## Uso

```typescript
const engine = new MLQueryEngine(vocab);
await engine.start();

const result = await engine.processQuery('SELECT * FROM users JOIN orders ON users.id = orders.user_id');

console.log(engine.getStats());
```
