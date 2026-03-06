Você é uma LLM atuando como arquiteta de software e engenheira sênior de backend/ML tooling.

Contexto do projeto:
Estamos construindo um sistema CLI que analisa estaticamente queries MySQL em tempo real. Hoje o sistema já possui uma base inicial de análise, com algumas limitações:

Análise atual:
- Existe um modelo BiLSTM criado, mas ele ainda não foi treinado; os pesos atuais são aleatórios.
- Os insights atuais são muito simples e majoritariamente baseados em regex.
- A extração de features ainda é simples.
- Ainda não temos dados históricos de performance suficientes.
- Usamos TensorFlow.js para ML.
- Estávamos pensando em JSONL para armazenamento de metadados/eventos, mas ainda estamos na fase de planejamento.
- Queremos evoluir o modelo aos poucos, sem começar com uma infraestrutura robusta de ML ou armazenamento.

Objetivo desta tarefa:
Quero que você proponha um plano técnico inicial, dividido em 3 fases, com foco em simplicidade, clareza estrutural e evolução futura.

As 3 fases são:
1. Armazenamento inicial
2. Expandir Feature Engineering
3. Forma de treinar e retreinar o modelo

Importante:
- NÃO queremos começar com uma máquina robusta de aprendizado.
- NÃO queremos começar com uma plataforma complexa de dados.
- Queremos um desenho inicial leve, mas estruturado o suficiente para permitir evolução sem recomeçar do zero.
- A resposta deve ser técnica, pragmática e realista.
- Prefira soluções simples e fáceis de implementar.
- Quando houver mais de uma opção, recomende uma principal e justifique brevemente.
- Não invente complexidade desnecessária.
- Evite buzzwords vazias.
- A resposta deve considerar que isso será implementado em etapas por engenharia.

Temos como exemplo atual de evento algo próximo disso:

{
  "query": "SELECT * FROM orders WHERE user_id = ?",
  "executionTimeMs": 150,
  "database": "myapp",
  "timestamp": "2026-03-05T10:30:00Z",
  "executionPlan": {
    "table": "orders",
    "type": "ref",
    "keyUsed": "user_id_idx",
    "rowsExamined": 120,
    "rowsReturned": 1
  },
  "catalogInfo": {
    "database": "myapp",
    "table": "orders",
    "rowCount": 50000,
    "indexes": [
      {
        "name": "user_id_idx",
        "columns": ["user_id"]
      }
    ]
  }
}

Sua missão:
Produza um plano técnico estruturado para essas 3 fases, com alto poder de execução por time técnico.

Requisitos da resposta:
1. Organize a resposta por fase.
2. Para cada fase, traga:
   - objetivo da fase
   - escopo inicial
   - decisões técnicas recomendadas
   - formato mínimo de dados/artefatos
   - riscos e cuidados
   - critério de pronto
3. Seja explícito sobre o que deve ser feito agora e o que deve ser adiado.
4. Sempre priorize um caminho inicial simples.
5. Quando falar de armazenamento, pense em algo local/leve primeiro.
6. Quando falar de feature engineering, pense em algo simples e explicável primeiro.
7. Quando falar de treino/retreino, pense em um fluxo manual e versionado primeiro.
8. Considere que o modelo precisa evoluir no futuro, então o desenho deve permitir crescimento.
9. Se fizer sentido, proponha versões de schema e versionamento de modelo/features.
10. A resposta deve estar em português do Brasil.

Além do plano, quero que você entregue também:

A. Uma recomendação objetiva de stack inicial para cada fase.
B. Um exemplo mínimo de schema de evento evolutivo.
C. Um exemplo de conjunto inicial de features.
D. Um fluxo simples de treino e retreino.
E. Uma seção final chamada "Roadmap recomendado de implementação".

Restrições:
- Não proponha de início: data lake, Kafka, pipelines distribuídos, feature store, MLOps enterprise, clusters, ou qualquer arquitetura pesada.
- Não proponha dependências que não sejam claramente justificadas.
- Não tente resolver tudo de uma vez.
- Não trate embeddings, transformers ou modelos complexos como prioridade nesta fase inicial.
- Não coloque observabilidade avançada como dependência inicial.
- Não proponha banco complexo logo de cara, a menos que haja justificativa muito clara.

Diretriz de qualidade:
A resposta precisa ser boa o suficiente para servir como base de execução de engenharia, e não apenas como brainstorm conceitual.

Forma esperada da resposta:
- Introdução curta
- Fase 1
- Fase 2
- Fase 3
- Stack recomendada
- Exemplo de schema
- Exemplo de features
- Fluxo de treino/retreino
- Roadmap recomendado de implementação

Se houver trade-offs, deixe claros.
Se houver incertezas, assuma o caminho mais simples que preserve evolução futura.