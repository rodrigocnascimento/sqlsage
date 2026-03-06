# Auditoria Tecnica - sql-ml-cli v0.2

Analise critica do estado atual da ferramenta, com foco na capacidade real de predicao de queries problematicas no MySQL.

**Data:** 2026-03-06
**Escopo:** Pipeline completo -- coleta, features, treinamento, predicao.

---

## 1. Resumo Executivo

A ferramenta possui toda a estrutura de um analisador ML de queries SQL: CLI com 5 comandos, pipeline de dados em JSONL, extrator de 18 features, arquitetura BiLSTM com TensorFlow.js, e documentacao completa.

Porem, o nucleo de predicao **nao funciona**. O comando `analyze` retorna scores baseados em pesos aleatorios (modelo nunca treinado). O pipeline de treinamento (`train`) produz um modelo que nunca e recarregado. Os dois sistemas sao incompativeis entre si. Nenhuma parte do codigo se conecta a um banco MySQL real.

As unicas deteccoes uteis sao 3 regras heuristicas baseadas em regex que nao dependem de ML.

---

## 2. Dois Sistemas Desconectados

Existem dois sistemas ML independentes no codigo que **nao se comunicam**:

### Sistema A -- usado pelo `analyze` (v0.1)

- Arquivos: `src/services/ml/engine/model.ts`, `feature-engineer.ts`, `index.ts`
- Modelo construido do zero a cada execucao com **pesos aleatorios**
- Nunca carrega pesos treinados de disco
- Usa 8 features normalizadas e vocabulario de 19 tokens
- Sequencia de entrada: 100 palavras

### Sistema B -- usado pelo `train` (v0.2)

- Arquivo: `src/services/ml/train.ts`
- Modelo treinado com dados do pipeline (`features.jsonl`)
- Salva apenas topologia JSON, **pesos sao descartados**
- Usa 18 features e vocabulario de 100 tokens
- Sequencia de entrada: 20 palavras

### Incompatibilidade

| Propriedade | Sistema A (`analyze`) | Sistema B (`train`) |
|---|---|---|
| Vocabulario | 19 tokens | 100 tokens |
| Tamanho da sequencia | 100 | 20 |
| Meta features | 8 | 18 |
| Feature engineer | `SQLFeatureEngineer` | `FeatureExtractor` |
| Pesos do modelo | Aleatorios | Treinados (mas perdidos) |
| Carrega modelo salvo? | Nao | N/A (salva, nunca recarrega) |

Mesmo que se tentasse conectar os dois, as dimensoes de entrada nao batem. Seria necessario reconstruir um dos sistemas para ser compativel com o outro.

---

## 3. O Comando `analyze` em Detalhe

### Fluxo de execucao

```
sql-ml analyze arquivo.sql
  -> MLPredictionService.initialize()
    -> MLQueryEngine.start()
      -> QueryPerformancePredictor.buildModel()  // pesos ALEATORIOS
  -> MLPredictionService.predict(sql)
    -> SQLFeatureEngineer.process(sql)           // 8 features via regex
    -> QueryPerformancePredictor.explainPrediction(vector)
      -> model.predict(inputs)                    // forward pass com pesos aleatorios
      -> generateInsights(vector, score)          // 3 regras hardcoded
```

### O score e aleatorio

O `performanceScore` retornado e a saida de um sigmoid em um modelo com pesos inicializados aleatoriamente. Na pratica, o valor flutua em torno de 0.5 sem correlacao com a complexidade da query. Rodar o mesmo arquivo duas vezes pode retornar scores diferentes dependendo da inicializacao.

### Os insights sao heuristicas, nao ML

As 3 regras de insight em `model.ts` (metodo `generateInsights`):

1. **PERFORMANCE_BOTTLENECK** -- `features[4] > 0.5` -- detecta cross join implicito (tabelas separadas por virgula no FROM sem JOIN)
2. **SCHEMA_SUGGESTION** -- `features[5] > 0` -- reporta colunas no WHERE sem indice (mas o SchemaRegistry esta sempre vazio, entao TODA coluna e reportada como sem indice)
3. **ANTI_PATTERN** -- `features[6] > 0` -- detecta LIKE com wildcard no inicio (`LIKE '%...'`)

Essas regras sao uteis mas triviais. Nao dependem do modelo neural e poderiam existir como um linter de SQL simples, sem TensorFlow.

### SchemaRegistry sempre vazio

O `SchemaRegistry` em `schema-registry.ts` e inicializado sem nenhuma tabela registrada. Como o `analyze` nunca recebe DDLs, `isIndexed()` retorna `false` para qualquer coluna. Isso faz o `missingIndexCount` reportar falsos positivos em todas as queries.

---

## 4. O Pipeline de Treinamento em Detalhe

### Labels baseados em tempo relativo

```typescript
// train.ts - prepareData()
const maxExecutionTime = Math.max(...records.map(r => r.executionTimeMs));
const normalizedTime = record.executionTimeMs / maxExecutionTime;
const performanceScore = normalizedTime > 0.5 ? 1 : 0;
```

O label "lento" e definido como: `executionTimeMs / maximo_do_dataset > 0.5`.

**Problema:** o label depende inteiramente da composicao do dataset, nao da performance real da query.

| Cenario | Query de 60ms | Label |
|---|---|---|
| Dataset onde a mais lenta e 100ms | `60/100 = 0.6 > 0.5` | **Lenta** |
| Dataset onde a mais lenta e 5000ms | `60/5000 = 0.012 < 0.5` | **Rapida** |

Uma mesma query pode ser rotulada como lenta ou rapida dependendo do que mais existe no dataset. Nao ha ground truth absoluto.

### Tokenizacao com alta colisao

```typescript
// train.ts - tokenizeQuery()
const hash = this.simpleHash(word);
tokens.push(hash % this.VOCAB_SIZE); // VOCAB_SIZE = 100
```

O tokenizador usa hash modulo 100. Com vocabulario SQL + nomes de tabelas/colunas, a taxa de colisao e alta. Palavras semanticamente diferentes (ex: `SELECT` e algum identificador) podem mapear para o mesmo token. A sequencia e truncada em 20 palavras -- queries complexas perdem informacao.

### Modelo salva topologia, descarta pesos

```typescript
// train.ts - saveModel()
const modelJSON = this.model!.toJSON();
writeFileSync(modelPath, JSON.stringify(modelJSON, null, 2));
```

`model.toJSON()` retorna apenas a arquitetura (camadas, dimensoes, ativacoes). Os pesos aprendidos durante o treinamento **nao sao incluidos**. O metodo correto seria `model.save('file://...')` que gera `model.json` + arquivos binarios de pesos, mas isso requer `@tensorflow/tfjs-node`.

**Consequencia:** mesmo que o treinamento convergisse, o modelo salvo nao pode ser recarregado com os pesos aprendidos. Todo conhecimento adquirido e perdido.

### Dataset insuficiente

O dataset atual tem 17 amostras com tempos de execucao aparentemente inventados (numeros redondos: 800, 100, 1200, 600, 400, 50, 700, 300, 250, 20ms). O modelo BiLSTM com Embedding + LSTM bidirecional tem dezenas de milhares de parametros. Treinar com 17 exemplos produz:

- **Loss final: 0.689** -- quase identico ao baseline de chance aleatorio (0.693 para binary crossentropy)
- **Accuracy: 84.6%** -- consistente com prever a classe majoritaria nos 14 exemplos de treino
- **Val accuracy: 100% em 3 amostras** -- ruido estatistico sem significado

---

## 5. Componentes Orfaos e Mocks

### ExplainParser (funcional, mas nao usado)

`src/services/ml/engine/explain-parser.ts` e um parser completo de resultados EXPLAIN do MySQL (formato JSON e texto tabulado). Extrai `selectType`, `table`, `type`, `possibleKeys`, `keyUsed`, `rowsExamined`, `rowsReturned`. O metodo `getSummary()` identifica full table scans.

**Status:** nenhum comando ou pipeline chama este parser. Ele existe isolado, sem integracao.

### CatalogGatherer (mock completo)

`src/services/ml/engine/catalog-gatherer.ts` aceita configuracao de conexao MySQL (`host`, `port`, `user`, `password`, `database`) mas **nunca abre uma conexao**. O metodo principal se chama `createMockCatalogInfo` e retorna dados hardcoded:

- Tabela `users`: 10000 linhas, indice em `id`
- Tabela `orders`: 50000 linhas, indices em `user_id` e `created_at`
- Tabela `products`: 5000 linhas, indice em `category_id`
- `avgRowLength` usa `Math.random()` -- literalmente um valor aleatorio

**Status:** nao e chamado por nenhum pipeline. O `FeatureExtractor` aceita `catalogInfo` como parametro opcional, mas recebe `undefined` em todas as execucoes reais.

### Features sempre zero

Duas features do `FeatureExtractor` dependem de dados externos:

- `whereColumnsIndexed` -- precisa de `catalogInfo.indexes` para verificar se colunas no WHERE tem indice. Sem `catalogInfo`, retorna 0.
- `estimatedRows` -- precisa de `executionPlan.rowsExamined`. Sem `executionPlan`, retorna 0.

No `feature-engineer.ts` (v0.1), `estimatedRowsExamined` e hardcoded como `0` na linha 84, sem nenhuma logica de estimativa.

Na pratica, 16 das 18 features sao regex puro sobre o texto SQL, e 2 sao sempre zero.

---

## 6. Resumo das Capacidades Reais

### O que funciona

| Funcionalidade | Status | Valor real |
|---|---|---|
| CLI com 5 comandos | Funcional | Estrutura solida |
| Parser de slow query log | Funcional | Util para coleta |
| ExplainParser | Funcional | Util, mas desconectado |
| Extracao de 16 features por regex | Funcional | Basico mas funcional |
| Deteccao de cross join implicito | Funcional | Util |
| Deteccao de LIKE com wildcard inicial | Funcional | Util |
| Pipeline de dados JSONL | Funcional | Bem estruturado |

### O que nao funciona

| Funcionalidade | Problema |
|---|---|
| Score de performance (`analyze`) | Baseado em pesos aleatorios -- valor sem significado |
| Treinamento do modelo (`train`) | Modelo salvo sem pesos; nunca recarregado |
| Predicao ML | Dois sistemas incompativeis desconectados |
| Deteccao de indices ausentes | SchemaRegistry vazio gera falsos positivos em toda query |
| Estimativa de linhas examinadas | Hardcoded `0` em ambos os sistemas |
| Conexao com MySQL | Nao existe; CatalogGatherer e mock |
| Labels de treinamento | Relativos ao dataset, sem ground truth |

---

## 7. Gap para Atingir o Objetivo

O objetivo declarado e: **prever queries problematicas para provar que o uso da ferramenta aumenta eficiencia e reduz custo de MySQL**.

Para isso, a ferramenta precisaria demonstrar que detecta problemas que um humano levaria mais tempo para encontrar, com precisao suficiente para justificar confianca.

### Gaps criticos

1. **Predicao funcional** -- O `analyze` precisa usar um modelo treinado com pesos reais, nao aleatorios
2. **Unificacao dos sistemas** -- Um unico pipeline: treinar, salvar com pesos, carregar para inferencia
3. **Dados reais** -- Centenas ou milhares de queries reais com tempos de execucao medidos, nao inventados
4. **Labels significativos** -- Threshold absoluto (ex: > 500ms = lento) ou classificacao baseada em EXPLAIN (full table scan = problematico)
5. **Integracao com MySQL** -- EXPLAIN real, catalogo real, informacoes de indices reais
6. **Validacao mensuravel** -- Metricas de precision/recall em um test set separado com queries cujo comportamento e conhecido

### O que e recuperavel

A estrutura CLI, o pipeline de dados, o ExplainParser, e o design geral sao solidos. O problema nao e arquitetural -- e de integracao e completude. As pecas existem mas nao estao conectadas.
