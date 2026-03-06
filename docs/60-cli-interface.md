# Interface CLI

## Visão Geral

Interface de linha de comando que expõe a funcionalidade do sistema para uso direto via terminal.

## Comandos

### analyze

Analisa um arquivo SQL e retorna predição de performance.

```bash
sql-ml analyze <file.sql>
sql-ml analyze <file.sql> --output result.json
sql-ml analyze <file.sql> --verbose
```

**Opções:**
- `-o, --output <file>`: Salva resultado em JSON
- `-v, --verbose`: Exibe status detalhado

### status

Mostra o estado atual do motor de ML.

```bash
sql-ml status
```

## Saída

### Formato JSON
```json
{
  "performanceScore": 0.75,
  "insights": [
    {
      "lineNumber": 1,
      "issueType": "SCHEMA_SUGGESTION",
      "severityScore": 0.7,
      "educationalFix": "...",
      "affectedSegment": "WHERE clause"
    }
  ],
  "features": {
    "joinCount": 2,
    "subqueryDepth": 1,
    "whereClauseComplexity": 3,
    "selectedColumnsCount": 5,
    "hasCartesianRisk": false,
    "missingIndexCount": 1,
    "fullTableScanRisk": false
  }
}
```

### Resumo em Texto
```
Summary:
  Performance Score: 75.0%
  Insights Found: 1
  ⚠️  1 potential missing indexes
```

## Scores e Severidade

### Performance Score (0-1)
- **0.0 - 0.3**: Crítico - Query muito lenta esperada
- **0.3 - 0.6**: Alerta - Pode ter problemas de performance
- **0.6 - 0.8**: Bom - Query razoável
- **0.8 - 1.0**: Excelente - Query bem otimizada

### Severity Score (0-1)
Cada insight tem um severityScore indicando gravidade:
- **0.0 - 0.3**: Informativo
- **0.3 - 0.6**: Moderado
- **0.6 - 0.8**: Alto
- **0.8 - 1.0**: Crítico

### Threshold para Pipeline

O sistema pode ser integrado em pipelines CI/CD usando thresholds:

```bash
# Exemplo: falhar pipeline se score < 0.5 OU severity >= 0.8
sql-ml analyze query.sql --output result.json

SCORE=$(jq '.performanceScore' result.json)
SEVERITY=$(jq '[.insights[].severityScore] | max // 0' result.json)

if (( $(echo "$SCORE < 0.5" | bc -l) )) || (( $(echo "$SEVERITY >= 0.8" | bc -l) )); then
  echo "❌ Pipeline abortado: Query com performance ruim ou problema crítico"
  exit 1
fi
```

### Mapa de Tipos de Insight

| Tipo | Severity Base | Gatilho |
|------|---------------|---------|
| PERFORMANCE_BOTTLENECK | 0.9 | Produto cartesiano implícito |
| ANTI_PATTERN | 0.8 | LIKE com % no início |
| SCHEMA_SUGGESTION | 0.7 | Coluna sem índice |
| SYNTAX_OPTIMIZATION | 0.5 | (Reservado) |

## Instalação

```bash
npm run build
npm link  # Para usar 'sql-ml' globalmente
```
