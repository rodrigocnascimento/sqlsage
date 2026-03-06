Análise Atual

Limitações do modelo atual:
1. Modelo BiLSTM criado mas não treinado - pesos são aleatórios
2. Apenas 3 tipos de insights (regex-based, não aprendidos)
3. Feature extraction simples via regex
4. Sem dados históricos de performance

Proposta: Como Tornar o Modelo Mais Inteligente

1. Adicionar Datasets para Treinamento
    O que coletar:
      - Queries SQL reais + tempo de execução
      - Plans de execução (EXPLAIN/EXPLAIN ANALYZE)
      - Dados de catálogo (índices, statistics)
    Fontes de dados:
       - Query logs do mysql slow query log

2. Expandir Feature Engineering
Adicionar detection de mais anti-patterns:
- N+1 queries
- Functions em colunas no WHERE
- OR em vez de UNION
- SELECT * desnecessário
- Subqueries correlatas

3. Treinar o Modelo
O modelo atual só faz predict com pesos aleatórios. Precisaria:
- Labeled data (sql → performance score)
- Fine-tune do modelo
  
