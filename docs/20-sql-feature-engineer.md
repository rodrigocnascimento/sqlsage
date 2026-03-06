# SQLFeatureEngineer

## Visão Geral

Responsável por tokenizar queries SQL e extrair features estruturais que alimentam o modelo de ML. Atua como o "front-end" de extração de dados do sistema.

## Modelo Mental

```
Query SQL String → Tokenização → Mapeamento Vocab → Features Estruturais → Normalização
```

## Fluxo de Processamento

1. **Tokenização**: Quebra a query em tokens (palavras-chave, identificadores, operadores)
2. **Mapeamento**: Converte tokens em índices numéricos baseados no vocabulário
3. **Extração**: Calcula features estruturais (JOINs, subqueries, etc)
4. **Normalização**: Escala todas as features para intervalo 0-1

## Vocabulário

- Tokens conhecidos: mapeados para índices 2+
- UNK_TOKEN (desconhecido): índice 1
- PAD_TOKEN (padding): índice 0

## Features Extraídas

| Feature | Como é Calculada |
|---------|------------------|
| joinCount | `(query.match(/JOIN/g) \|\| []).length` |
| subqueryDepth | Profundidade máxima de parênteses aninhados |
| whereClauseComplexity | Contagem de AND/OR/IN no WHERE |
| selectedColumnsCount | Colunas antes do FROM + 1 |
| hasCartesianRisk | 1 se "," no FROM sem JOIN |
| missingIndexCount | Colunas no WHERE sem índice |
| fullTableScanRisk | 1 se `LIKE '%...'` |

## Uso

```typescript
const engineer = new SQLFeatureEngineer(vocab, schemaRegistry);
const vector = engineer.process('SELECT * FROM users WHERE id = 1');

vector.tokenSequence       // [1, 2, 3, ...] (100 elementos)
vector.structuralFeatures  // [0.1, 0.0, 0.5, ...] (8 elementos)
```
