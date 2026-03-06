# QueryPerformancePredictor

## Visão Geral

O `QueryPerformancePredictor` é o componente central de ML do sistema, responsável por predizer a performance de queries SQL e gerar insights sobre possíveis problemas de otimização. Utiliza TensorFlow.js com uma arquitetura de rede neural BiLSTM.

## Arquitetura do Modelo

### Estrutura da Rede Neural

```
Input (token_sequence) → Embedding → BiLSTM
                                         ↓
Input (structural_features) → Dense → Concatenate → Dense → Dense (output)
```

- **Embedding Layer**: Transforma tokens SQL em vetores densos de dimensão 64
- **BiLSTM**: Rede neural recorrente bidirecional com 32 unidades
- **Meta Features**: 8 features estruturais processadas por uma camada densa
- **Output**: Score de performance entre 0 e 1 (sigmoid)

### Hiperparâmetros

| Parâmetro | Valor |
|-----------|-------|
| EMBEDDING_DIM | 64 |
| LSTM_UNITS | 32 |
| META_DIM | 8 |
| Input Sequence Length | 100 |

## Features de Entrada

### Token Sequence
- Sequência de tokens SQL tokenizados
- Tamanho máximo: 100 tokens
- Vocabulário: palavras-chave SQL + identificadores

### Structural Features (8 dimensões)

| Índice | Feature | Descrição |
|--------|---------|-----------|
| 0 | joinCount | Número de JOINs na query |
| 1 | subqueryDepth | Profundidade máxima de subqueries |
| 2 | whereClauseComplexity | Complexidade do WHERE (AND/OR/IN) |
| 3 | selectedColumnsCount | Número de colunas selecionadas |
| 4 | hasCartesianRisk | Risco de produto cartesiano (0/1) |
| 5 | missingIndexCount | Número de colunas sem índice |
| 6 | fullTableScanRisk | Risco de full table scan (0/1) |
| 7 | estimatedRowsExamined | Linhas estimadas (reservado) |

## Insights Gerados

O modelo gera automaticamente insights baseados nas features estruturais:

### 1. PERFORMANCE_BOTTLENECK
- **Trigger**: `features[4] > 0.5` (hasCartesianRisk)
- **Mensagem**: "Implicit cross join detected. Use explicit INNER JOIN syntax with ON conditions to avoid Cartesian products."
- **Segmento**: FROM clause

### 2. SCHEMA_SUGGESTION
- **Trigger**: `features[5] > 0` (missingIndexCount > 0)
- **Mensagem**: "Filter condition on unindexed column detected. Consider adding an index to improve lookup speed."
- **Segmento**: WHERE clause

### 3. ANTI_PATTERN
- **Trigger**: `features[6] > 0` (fullTableScanRisk)
- **Mensagem**: "Leading wildcard in LIKE predicate forces a full table scan. Remove the initial % if possible or use Full-Text Search."
- **Segmento**: LIKE predicate

## Por Que Apenas 3 Insights?

Das 8 features estruturais disponíveis, apenas 3 são utilizadas para gerar insights. Isso não é uma limitação técnica, mas uma decisão de design baseada nos seguintes princípios:

### Features Que Geram Insights (3)
Apenas features que representam **problemas críticos e corrigíveis** geram alertas:

| Feature | Por Que é Crítica |
|---------|-------------------|
| `hasCartesianRisk` | Produto cartesiano pode/explodir resultado exponentialmente |
| `missingIndexCount` | Falta de índice causa degradação linear O(n) |
| `fullTableScanRisk` | Full table scan é O(n) e não escala |

### Features Que NÃO Geram Insights (5)

| Feature | Razão |
|---------|-------|
| `joinCount` | Muitos JOINs podem ser necessários e válidos |
| `subqueryDepth` | Subqueries são válidas, performance depende do contexto |
| `whereClauseComplexity` | Condições complexas são normais em queries |
| `selectedColumnsCount` | SELECT * pode ser intencional em ETL |
| `estimatedRowsExamined` | Reservado para uso futuro |

### Filosofia do Design

O objetivo não é alertar sobre "complexidade", mas sobre **padrões que indicam problemas已知 de performance**. Uma query pode ter:
- 10 JOINs e ser perfeitamente otimizada
- 5 subqueries e executar em milissegundos
- 50 colunas no SELECT e ser a melhor abordagem

No entanto, um produto cartesiano implícito, coluna sem índice no WHERE, ou LIKE com `%` inicial são **quase sempre problemas** que têm impacto devastador na performance e possuem solução direta.

## Severity Score

O severity score é calculado multiplicando um valor base pelo `severityMultiplier`:

```typescript
const severityMultiplier = score < 0.2 ? 1.5 : 1.0;
const severityScore = Math.min(baseScore * severityMultiplier, 1.0);
```

- Queries com score < 0.2 recebem 50% a mais de severity
- Máximo capped em 1.0

## Uso

```typescript
import { QueryPerformancePredictor } from './model.js';

const predictor = new QueryPerformancePredictor(vocabSize, inputSeqLen);
predictor.buildModel();

const vector = {
  tokenSequence: [1, 2, 3, ...],  // 100 elementos
  structuralFeatures: [0.1, 0.2, 0.3, 0.4, 0, 0, 0, 0]
};

const result = await predictor.explainPrediction(vector);
console.log(result.performanceScore);  // 0.0 - 1.0
console.log(result.insights);          // Array de insights
```

## Considerações de Performance

- O modelo requer TensorFlow.js
- Tensores devem ser disposed manualmente após uso
- Recomendado usar `@tensorflow/tfjs-node` para melhor performance em Node.js
- O modelo é lightweight (~100KB) e carrega rapidamente
