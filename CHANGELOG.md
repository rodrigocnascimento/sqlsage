# Changelog

Todas as mudancas notaveis do projeto sao documentadas neste arquivo.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [0.3.0] - 2026-03-06

### Added
- Unified heuristic + ML prediction pipeline (heuristics as base, ML as optional complement)
- `heuristic-rules.ts` - Rule-based SQL analysis engine with pattern detection
- `tokenizer.ts` - SQL tokenizer for feature extraction
- `tdd-unify-prediction-engine.md` - Technical design document

### Changed
- `MLQueryEngine` refactored to orchestrate heuristic-first, ML-second pipeline
- `model.ts` updated with proper weight serialization and `findLatestModel` fix
- `train.ts` simplified to use new tokenizer-based feature extraction
- `ml-prediction.service.ts` slimmed to delegate to unified engine
- CLI command adjustments in `index.ts`

### Removed
- `feature-engineer.ts` - Replaced by heuristic-rules + tokenizer
- `schema-registry.ts` - Dead code from v0.1 architecture
- `types.ts` - Consolidated into engine modules

## [0.2.0] - 2026-03-06

### Adicionado

- **Pipeline de Dados (Fase 1)**
  - Comando `collect` para coletar queries de slow query logs do MySQL
  - Comando para adicionar queries manualmente via CLI
  - `SlowLogParser` para parsing de slow query log do MySQL
  - `DatasetStorage` para armazenamento em formato JSONL
  - Interface `ISQLQueryRecord` com campos: id, query, executionTimeMs, database, timestamp
  - Dados de exemplo em `data/examples/queries.jsonl`

- **Feature Engineering Expandido (Fase 2)**
  - Comando `features` para extracao de features das queries coletadas
  - `FeatureExtractor` com 18 features estruturais (expansao de 8 para 18)
  - `ExplainParser` para parsing de resultados EXPLAIN do MySQL (JSON e texto)
  - `CatalogGatherer` para coleta de informacoes de catalogo (mock)
  - Dados de exemplo em `data/examples/features.jsonl`

- **Treinamento de Modelo (Fase 3)**
  - Comando `train` para treinamento do modelo BiLSTM
  - `ModelTrainer` com pipeline completo: load, prepare, build, train, save
  - Configuracao de treinamento: epochs, batch size, validation split, learning rate
  - Versionamento de modelos com formato `v<timestamp>`
  - Modelos de exemplo em `models/examples/`

- **Testes**
  - Testes unitarios para `DatasetStorage` (10 testes)
  - Testes unitarios para `SlowLogParser` (10 testes)
  - Testes unitarios para `FeatureExtractor` (51 testes)
  - Testes unitarios para `ExplainParser` (19 testes)
  - Testes unitarios para `CatalogGatherer` (18 testes)
  - Testes unitarios para `ModelTrainer` (17 testes)
  - Total: 109 → 234 testes

- **Documentacao**
  - `docs/70-data-pipeline.md` - Pipeline de dados
  - `docs/80-feature-extractor.md` - Feature extractor v0.2
  - `docs/90-model-training.md` - Treinamento de modelo
  - `docs/95-end-to-end-workflow.md` - Workflow completo
  - `CONTRIBUTING.md` - Guia de contribuicao
  - `CHANGELOG.md` - Historico de mudancas
  - README traduzido para pt-BR com todos os 5 comandos

### Alterado

- `tsconfig.json`: Modulo alterado de ESNext para CommonJS (compatibilidade Node.js)
- `package.json`: Removido `"type": "module"` (mesmo motivo)
- `.gitignore`: Adicionados padroes para `data/*` e `models/*` com excecoes para `examples/`
- README.md: Reescrito em pt-BR com documentacao dos 5 comandos CLI

## [0.1.0] - 2026-03-06

### Adicionado

- Modelo BiLSTM com TensorFlow.js para predicao de performance
- `SQLFeatureEngineer` com 8 features estruturais
- `SchemaRegistry` para registro de DDLs e verificacao de indices
- `MLQueryEngine` como orquestrador dos componentes ML
- `MLPredictionService` como servico de alto nivel
- Comandos CLI: `analyze` e `status`
- 109 testes unitarios com ~95% de cobertura
- Documentacao tecnica em `docs/` (10 a 60)
- Deteccao de 3 tipos de insights: PERFORMANCE_BOTTLENECK, SCHEMA_SUGGESTION, ANTI_PATTERN
