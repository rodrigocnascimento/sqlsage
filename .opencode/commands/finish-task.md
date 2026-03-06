---
description: Finalizar tarefa, resumir entrega e solicitar aprovação
agent: plan
---

Siga o protocolo de Finalização de Tarefa:

## 1. Revisar a entrega concluída
Revise a tarefa executada e produza um resumo objetivo contendo:
- o que foi implementado, corrigido ou alterado
- arquivos principais impactados
- impactos técnicos relevantes
- classificação preliminar da mudança:
  - fix
  - feat
  - breaking change

## 2. Identificar a origem da versão
Localize a fonte oficial da versão do projeto, seguindo esta ordem de prioridade:
1. `package.json`
2. `composer.json`
3. `pyproject.toml`
4. `Cargo.toml`
5. outro manifesto/version file do projeto

Se nenhuma origem de versão for encontrada, informe isso claramente no output.

## 3. Sugerir o version bump
Use Semantic Versioning:
- `fix` -> PATCH
- `feat` -> MINOR
- `breaking change` -> MAJOR

Você deve informar:
- versão atual
- bump recomendado
- próxima versão estimada

## 4. Output obrigatório
O output deve conter obrigatoriamente:

1. Summary of delivered work
2. Main files changed
3. Change classification
4. Current version
5. Recommended bump
6. Next version

## 5. Pergunta obrigatória
Após exibir o resumo, você deve PARAR e perguntar exatamente:

"Do you approve these changes and the proposed version bump, Developer?"

## 6. Regras obrigatórias
- Não atualizar versão neste comando
- Não atualizar `CHANGELOG.md` neste comando
- Não criar commit, tag ou push neste comando
- Apenas revisar, classificar, sugerir o bump e pedir aprovação
- Se houver dúvida sobre a classificação (`fix`, `feat`, `breaking change`), expor isso objetivamente antes da pergunta final

## Tarefa Solicitada
$ARGUMENTS