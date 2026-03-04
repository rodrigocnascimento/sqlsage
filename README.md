# SQL ML CLI

A CLI tool to analyze SQL files using ML-based query performance prediction powered by TensorFlow.js.

## Features

- **Performance Prediction**: Predicts query performance score (0-100%)
- **Insights Detection**: Identifies common SQL anti-patterns:
  - Cartesian product risks
  - Full table scan risks
  - Missing index suggestions
- **Feature Analysis**: Extracts structural features from SQL queries

## Installation

```bash
npm install
```

## Usage

### Analyze a SQL file

```bash
npm run dev -- analyze <file.sql>
# or after building
npm run build
npm start -- analyze <file.sql>
```

Options:
- `-o, --output <file>` - Output JSON results to file
- `-v, --verbose` - Show verbose status output

### Check ML engine status

```bash
npm run dev -- status
```

## Example

```bash
npm run dev -- analyze my-query.sql
```

Output:
```json
{
  "performanceScore": 0.75,
  "insights": [
    {
      "lineNumber": 1,
      "issueType": "SCHEMA_SUGGESTION",
      "severityScore": 0.7,
      "educationalFix": "Filter condition on unindexed column detected...",
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

## Architecture

- **TensorFlow.js**: BiLSTM neural network for performance prediction
- **SQL Feature Engineer**: Tokenizes and extracts structural features from SQL
- **Schema Registry**: Optional schema knowledge for index recommendations

## License

MIT
