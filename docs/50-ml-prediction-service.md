# MLPredictionService

## Visão Geral

Serviço de alto nível exposto ao consumidor final. Simplifica o uso do MLQueryEngine e formata a resposta para o formato esperado pelo CLI.

## Modelo Mental

```
Request → MLQueryEngine → Response Formatada
```

## Interface

### MLPredictionRequest
```typescript
{
  sql: string;
  schemaContext?: string;  // Opcional
}
```

### MLPredictionResponse
```typescript
{
  performanceScore: number;      // 0.0 - 1.0
  insights: ISQLInsight[];
  features: {
    joinCount: number;
    subqueryDepth: number;
    whereClauseComplexity: number;
    selectedColumnsCount: number;
    hasCartesianRisk: boolean;
    missingIndexCount: number;
    fullTableScanRisk: boolean;
  };
  tokens: string[];  // Primeiros 20 tokens
}
```

## Métodos

### initialize()
Inicializa o motor de ML. Deve ser chamado antes de predict().

### predict(request)
Executa a análise da query SQL.

### getStatus()
Retorna status do serviço:
- `isLoaded`: Motor inicializado
- `vocabularySize`: Tamanho do vocabulário
- `queriesAnalyzed`: Queries processadas
- `trainingSessions`: Sessões de treino

## Uso

```typescript
const service = new MLPredictionService();
await service.initialize();

const result = await service.predict({
  sql: 'SELECT * FROM users WHERE name LIKE "%john%"'
});

console.log(result.performanceScore);  // ex: 0.45
console.log(result.insights);          // insights sobre performance
console.log(result.features);          // features extraídas
```
