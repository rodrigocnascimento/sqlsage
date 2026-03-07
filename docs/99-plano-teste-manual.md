# Plano de Teste Manual - sql-ml-cli v0.3

Roteiro para validar o pipeline completo da ferramenta, da coleta ao treinamento e analise.

**Escopo da v0.3:** a ferramenta detecta anti-patterns SQL e atribui scores de risco via heuristicas (sempre disponiveis) com complemento opcional de ML (quando um modelo treinado existe). Os scores representam risco estrutural relativo, nao custo real de execucao. Reducao de custo so podera ser validada em versoes futuras com integracao a `EXPLAIN ANALYZE` e metricas reais de workload.

**Pre-requisito:** build atualizado.

```bash
npm run build
```

---

## Etapa 1 - Status inicial

Verificar que o engine responde antes de qualquer operacao.

```bash
npm run start -- status
```

**Esperado:** JSON com status do engine (modelo carregado, versao, etc).

---

## Etapa 2 - Coleta de queries (`collect`)

### 2.1 - Adicionar queries individuais

Adicionar 12 queries com tempos variados (rapidas e lentas). O minimo para treinar e 10.

```bash
# Queries rapidas (< 50ms)
npm run start -- collect -q "SELECT id, name FROM users WHERE id = 1" -t 5 -d ecommerce
npm run start -- collect -q "SELECT email FROM users WHERE email = 'test@mail.com'" -t 8 -d ecommerce
npm run start -- collect -q "SELECT COUNT(*) FROM products WHERE active = 1" -t 12 -d ecommerce
npm run start -- collect -q "SELECT id FROM orders WHERE id = 100 LIMIT 1" -t 3 -d ecommerce
npm run start -- collect -q "SELECT name FROM categories WHERE parent_id IS NULL" -t 6 -d ecommerce
npm run start -- collect -q "SELECT 1" -t 1 -d ecommerce

# Queries lentas (> 200ms)
npm run start -- collect -q "SELECT * FROM orders WHERE created_at > NOW() - INTERVAL 30 DAY ORDER BY total DESC" -t 450 -d ecommerce
npm run start -- collect -q "SELECT u.name, COUNT(o.id) FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.name ORDER BY COUNT(o.id) DESC" -t 800 -d ecommerce
npm run start -- collect -q "SELECT * FROM products WHERE id IN (SELECT product_id FROM order_items WHERE quantity > 10)" -t 620 -d ecommerce
npm run start -- collect -q "SELECT p.name, c.name FROM products p JOIN categories c ON p.category_id = c.id JOIN order_items oi ON oi.product_id = p.id WHERE oi.price > 100 OR p.stock < 5" -t 950 -d ecommerce
npm run start -- collect -q "SELECT * FROM users u LEFT JOIN orders o ON u.id = o.user_id LEFT JOIN order_items oi ON o.id = oi.order_id WHERE o.status LIKE '%pending%' OR o.status LIKE '%review%'" -t 1200 -d ecommerce
npm run start -- collect -q "SELECT name FROM products WHERE UPPER(name) LIKE '%WIDGET%' UNION SELECT name FROM categories WHERE LOWER(name) LIKE '%widget%'" -t 380 -d ecommerce
```

**Verificar:** o arquivo `data/queries.jsonl` deve existir com 12 linhas.

```bash
wc -l data/queries.jsonl
cat data/queries.jsonl | head -3
```

### 2.2 - Testar erro (sem query e sem input)

```bash
npm run start -- collect
```

**Esperado:** mensagem de erro pedindo `--input` ou `--query`.

### 2.3 - (Opcional) Testar com slow log

Se voce tiver um slow query log do MySQL, pode testar o parser:

```bash
npm run start -- collect -i /caminho/para/slow-query.log -o data/queries-from-log.jsonl
```

---

## Etapa 3 - Extracao de features (`features`)

```bash
npm run start -- features
```

**Esperado:**
- Arquivo `data/features.jsonl` criado com 12 linhas
- Resumo no terminal mostrando: total de queries, quantas com JOIN, subqueries, SELECT *, tempo medio

**Verificar conteudo:**

```bash
wc -l data/features.jsonl
cat data/features.jsonl | head -1 | python3 -m json.tool
```

O primeiro registro deve conter os campos originais (`id`, `query`, `executionTimeMs`, etc) **mais** um objeto `features` com 18 campos numericos.

**Checklist de features para validar manualmente em 3 queries:**

| Query | Features esperadas |
|---|---|
| `SELECT id, name FROM users WHERE id = 1` | `selectStar: 0`, `hasJoin: 0`, `hasSubquery: 0`, `tableCount: 1` |
| `SELECT u.name, COUNT(o.id) FROM users u JOIN orders o ...` | `hasJoin: 1`, `joinCount: 1`, `hasGroupBy: 1`, `hasOrderBy: 1`, `hasCountStar: 0` (usa `COUNT(o.id)`, nao `COUNT(*)`) |
| `SELECT * FROM products WHERE id IN (SELECT ...)` | `selectStar: 1`, `hasSubquery: 1`, `subqueryCount: 1` |

---

## Etapa 4 - Treinamento do modelo (`train`)

### 4.1 - Treino com parametros padrao

```bash
npm run start -- train
```

**Esperado:**
- Treinamento roda com 50 epochs (padrao)
- Exibe loss e accuracy por epoch
- Cria 3 arquivos em `models/`:
  - `model-v<timestamp>.json` (topologia do modelo)
  - `model-v<timestamp>-weights.json` (pesos treinados)
  - `training-result-v<timestamp>.json` (metricas de treino)
- Exibe resumo final: loss, accuracy, amostras de treino/validacao, slowThreshold

**Verificar:**

```bash
ls -la models/
cat models/training-result-v*.json | python3 -m json.tool | head -25
```

O resultado do treino deve conter: `modelVersion`, `epochs`, `finalLoss`, `finalAccuracy`, `trainSamples`, `valSamples`, `slowThreshold`, e `metrics` (arrays de loss/accuracy por epoch).

### 4.2 - Treino com parametros customizados

```bash
npm run start -- train -e 20 -b 4 -l 0.0005 -v 0.3
```

**Esperado:** treino com 20 epochs, batch size 4, learning rate 0.0005, 30% validacao.

### 4.3 - Testar erro (dados insuficientes)

Criar um arquivo com apenas 3 registros e tentar treinar:

```bash
head -3 data/features.jsonl > /tmp/few-features.jsonl
npm run start -- train -i /tmp/few-features.jsonl
```

**Esperado:** erro informando que precisa de no minimo 10 amostras.

---

## Etapa 5 - Analise de SQL (`analyze`)

### 5.1 - Query simples

Criar arquivo de teste:

```bash
echo "SELECT id, name FROM users WHERE id = 1;" > /tmp/test-simple.sql
npm run start -- analyze /tmp/test-simple.sql
```

**Esperado:** JSON com `performanceScore` (0-1), `features` (18 campos estruturais), `insights` (provavelmente vazio ou poucos para query simples), e `mlAvailable` (boolean indicando se modelo treinado foi carregado).

### 5.2 - Query complexa

```bash
cat > /tmp/test-complex.sql << 'EOF'
SELECT
  u.name,
  u.email,
  COUNT(o.id) as total_orders,
  SUM(oi.price * oi.quantity) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
LEFT JOIN order_items oi ON o.id = oi.order_id
WHERE o.created_at > NOW() - INTERVAL 90 DAY
  OR u.status LIKE '%vip%'
GROUP BY u.name, u.email
ORDER BY total_spent DESC;
EOF
npm run start -- analyze /tmp/test-complex.sql
```

**Esperado:**
- `performanceScore` mais baixo (query mais arriscada)
- `features` mostrando campos estruturais: `hasJoin: 1`, `joinCount: 2`, `hasOr: 1`, `hasLike: 1`, `hasGroupBy: 1`, `hasOrderBy: 1`
- `insights` com alertas do motor heuristico. Validar presenca de:

| Insight esperado | Tipo | Motivo |
|---|---|---|
| `leading-wildcard` | PERFORMANCE_BOTTLENECK | `LIKE '%vip%'` impede uso de indice |
| `or-instead-of-union` | SYNTAX_OPTIMIZATION | `OR` em clausulas de tabelas distintas |

**Nota v0.3:** Na v0.2, campos como `hasCartesianRisk`, `fullTableScanRisk` e `missingIndexCount` existiam como campos numericos no objeto `features`. Na v0.3, esses conceitos foram movidos para o motor heuristico e aparecem como entradas em `insights[]` (com `issueType` e `educationalFix`), nao mais como feature fields.

### 5.3 - Analise com verbose

```bash
npm run start -- analyze /tmp/test-complex.sql -v
```

**Esperado:** saida inclui status do engine alem da analise.

### 5.4 - Saida para arquivo

```bash
npm run start -- analyze /tmp/test-complex.sql -o /tmp/result.json
cat /tmp/result.json | python3 -m json.tool
```

**Esperado:** JSON valido gravado no arquivo.

---

## Etapa 6 - Pipeline completo (resumo)

Apos todas as etapas, voce deve ter:

| Artefato | Caminho | Linhas/Arquivos |
|---|---|---|
| Queries coletadas | `data/queries.jsonl` | 12 linhas |
| Features extraidas | `data/features.jsonl` | 12 linhas |
| Modelo treinado (topologia) | `models/model-v*.json` | 1+ arquivos |
| Modelo treinado (pesos) | `models/model-v*-weights.json` | 1+ arquivos |
| Resultado treino | `models/training-result-v*.json` | 1+ arquivos |

---

## Etapa 7 - Limpeza

Para resetar e rodar novamente:

```bash
rm -f data/queries.jsonl data/features.jsonl
rm -f models/model-v*.json models/training-result-v*.json
rm -f /tmp/test-simple.sql /tmp/test-complex.sql /tmp/few-features.jsonl /tmp/result.json
```

Os exemplos em `data/examples/` e `models/examples/` permanecem intactos.

**Nota:** o glob `models/model-v*.json` captura tanto os arquivos de topologia quanto os de pesos (`-weights.json`).
