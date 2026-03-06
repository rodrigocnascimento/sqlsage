# TDD: Unificacao do Motor de Predicao

**Issue:** ISSUE-003
**Branch:** `feat/ISSUE-003-unify-prediction-engine`
**Data:** 2026-03-06

---

## 1. Objective & Scope

### What

Unificar os dois sistemas ML desconectados (v0.1 usado pelo `analyze`, v0.2 usado pelo `train`) em um pipeline unico e funcional. Expandir as heuristicas para cobrir anti-patterns comuns de MySQL. Remover codigo morto.

### Why

O `analyze` retorna scores aleatorios (modelo nunca treinado). O `train` salva modelo sem pesos. Os dois sistemas tem arquiteturas incompativeis. A ferramenta nao cumpre seu objetivo.

### Estrategia

**Heuristicas como base, ML como complemento opcional.**

```
Score = Heuristico (deterministico, sempre disponivel)
      + Ajuste ML (opcional, requer modelo treinado)
```

---

## 2. Proposed Technical Strategy

### 2.1 Remocoes (codigo morto)

| Arquivo | Motivo |
|---|---|
| `src/services/ml/engine/feature-engineer.ts` | Substituido pelo `FeatureExtractor` (18 features) |
| `src/services/ml/engine/feature-engineer.test.ts` | Testes do modulo removido |
| `src/services/ml/engine/schema-registry.ts` | Inicializado vazio, nunca populado, gera falsos positivos |

### 2.2 Feature set unico

Padronizar no `FeatureExtractor` (18 features):

| Propriedade | Valor |
|---|---|
| Feature set | 18 features do `FeatureExtractor` |
| Vocabulario | ~50 keywords SQL fixas + hash para identificadores (range 61-100) |
| Sequencia | 20 tokens |
| Meta features | 18 |

### 2.3 Tokenizacao melhorada

Keywords SQL recebem tokens fixos (sem colisao). Identificadores usam hash no range restante.

```typescript
const SQL_KEYWORDS: Record<string, number> = {
  'SELECT': 2, 'FROM': 3, 'WHERE': 4, 'JOIN': 5,
  'LEFT': 6, 'RIGHT': 7, 'INNER': 8, 'ON': 10,
  'AND': 11, 'OR': 12, 'IN': 13, 'LIKE': 17,
  'GROUP': 20, 'BY': 21, 'ORDER': 22, 'LIMIT': 24,
  'UNION': 26, 'COUNT': 37, 'SUM': 38, 'AVG': 39,
  // ... ~50 keywords com tokens fixos
};
// 0 = PAD, 1 = UNK, 2-60 = keywords, 61-100 = identificadores (hash)
```

### 2.4 Salvamento de modelo com pesos

Serializar pesos manualmente (sem depender de `@tensorflow/tfjs-node`):

```typescript
// Salvar
const weights = model.getWeights().map(w => ({
  name: w.name, shape: w.shape, data: Array.from(w.dataSync())
}));
writeFileSync(weightsPath, JSON.stringify(weights));

// Carregar
const tensors = weightData.map(w => tf.tensor(w.data, w.shape));
model.setWeights(tensors);
```

Saida do `train`:
- `models/model-<version>.json` -- topologia
- `models/model-<version>-weights.json` -- pesos serializados (**novo**)
- `models/training-result-<version>.json` -- metricas

### 2.5 Carregamento de modelo no `analyze`

```
analyze arquivo.sql [--model models/model-v123.json]
  1. Se --model fornecido: carregar topologia + pesos -> modo ML + heuristicas
  2. Se nao: procurar modelo mais recente em models/
     - Se encontrar: carregar -> modo ML + heuristicas
     - Se nao encontrar: modo heuristicas apenas
```

Fallback gracioso: ferramenta SEMPRE funciona, mesmo sem modelo treinado.

### 2.6 Motor de heuristicas (~15 regras)

Novo arquivo `src/services/ml/engine/heuristic-rules.ts`:

| # | Regra | Tipo | Penalidade |
|---|---|---|---|
| 1 | Cross join implicito (FROM a, b) | PERFORMANCE_BOTTLENECK | 25 |
| 2 | LIKE com wildcard inicial (`'%...'`) | ANTI_PATTERN | 15 |
| 3 | SELECT * com JOIN | ANTI_PATTERN | 10 |
| 4 | UPDATE/DELETE sem WHERE | PERFORMANCE_BOTTLENECK | 30 |
| 5 | OR em colunas diferentes | PERFORMANCE_BOTTLENECK | 10 |
| 6 | Funcao em coluna no WHERE | ANTI_PATTERN | 15 |
| 7 | Subquery no WHERE (correlacionada) | PERFORMANCE_BOTTLENECK | 20 |
| 8 | SELECT sem LIMIT | SYNTAX_OPTIMIZATION | 5 |
| 9 | COUNT(*) sem WHERE | PERFORMANCE_BOTTLENECK | 10 |
| 10 | JOIN sem ON | PERFORMANCE_BOTTLENECK | 25 |
| 11 | Multiplos OR -> poderia ser IN() | SYNTAX_OPTIMIZATION | 5 |
| 12 | Nested subqueries (profundidade > 2) | PERFORMANCE_BOTTLENECK | 15 |
| 13 | UNION sem ALL | SYNTAX_OPTIMIZATION | 5 |
| 14 | Mais de 5 JOINs | PERFORMANCE_BOTTLENECK | 10 |
| 15 | SELECT DISTINCT com ORDER BY em coluna ausente | ANTI_PATTERN | 10 |

Score heuristico: `max(0, 100 - soma_penalidades) / 100`

### 2.7 Score unificado

```typescript
if (modelLoaded) {
  score = heuristicoNormalizado * 0.6 + mlScore * 0.4;
} else {
  score = heuristicoNormalizado;
}
```

### 2.8 Labels de treinamento

Threshold absoluto configuravel (default 500ms):

```
train -i data/features.jsonl --slow-threshold 500
```

Queries com `executionTimeMs > threshold` = label 1 (lenta).

---

## 3. Implementation Plan

### Arquivos a REMOVER

- `src/services/ml/engine/feature-engineer.ts`
- `src/services/ml/engine/feature-engineer.test.ts`
- `src/services/ml/engine/schema-registry.ts`

### Arquivos a CRIAR

- `src/services/ml/engine/heuristic-rules.ts` -- motor de ~15 regras
- `src/services/ml/engine/tokenizer.ts` -- tokenizacao com vocabulario SQL explicito
- `src/services/ml/engine/heuristic-rules.test.ts` -- testes das regras
- `src/services/ml/engine/tokenizer.test.ts` -- testes do tokenizador

### Arquivos a REFATORAR

| Arquivo | Mudanca |
|---|---|
| `model.ts` | META_DIM=18, seqLen=20, vocab=100, `loadWeights()`, `saveWeights()`, remover `generateInsights()` |
| `train.ts` | Salvar pesos, threshold absoluto, usar novo tokenizador |
| `index.ts` (engine) | Remover SchemaRegistry e SQLFeatureEngineer, usar FeatureExtractor, carregar modelo |
| `ml-prediction.service.ts` | Score unificado, HeuristicEngine, fallback, novo formato response |
| `types.ts` (engine) | Remover ISQLStructuralFeatures (8 campos), adaptar interfaces |
| `src/index.ts` (CLI) | Opcoes `--model`, `--slow-threshold` |

### Testes a REMOVER

- `src/services/ml/engine/feature-engineer.test.ts` (testes do v0.1)

### Testes a ADAPTAR

- Todos os testes que importam de `feature-engineer.ts` ou `schema-registry.ts`

### Ordem de execucao

1. Remover arquivos mortos (`feature-engineer.ts`, `schema-registry.ts`, testes)
2. Criar `tokenizer.ts` + testes
3. Criar `heuristic-rules.ts` + testes
4. Refatorar `types.ts`
5. Refatorar `model.ts` (dimensoes unificadas + load/save weights)
6. Refatorar `train.ts` (salvar pesos + threshold absoluto + novo tokenizador)
7. Refatorar `MLQueryEngine` (FeatureExtractor + carregar modelo)
8. Refatorar `MLPredictionService` (score unificado + fallback)
9. Atualizar CLI (`index.ts`)
10. Build + test + validacao

---

## 4. Fora do escopo

- Conexao real com MySQL (v0.3)
- Dataset real com centenas de queries (requer coleta em ambiente de producao)
- Regressao em vez de classificacao binaria (requer mais dados)
