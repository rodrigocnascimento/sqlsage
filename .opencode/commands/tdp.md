---
description: Iniciar Technical Design Phase (TDP)
agent: plan
---

Siga o protocolo TDP (Mandatory Technical Design Phase):

## 1. Identificar Stable Base
Determine qual é a branch estável (stable > main > master) usando:
```
git fetch --all --prune
git branch
```

## 2. Regras do Protocolo (do AGENTS.md)
- Não gere código antes de criar o TDD
- Crie o documento em `docs/tdd-<feature-slug>.md`
- Inclua: Objective & Scope, Proposed Technical Strategy, Implementation Plan

## 3. Output Obrigatório
Após criar o TDD, você deve PARAR e perguntar:
"Do you approve this technical approach, Developer?"

Aguarde aprovação explícita antes de qualquer implementação.

## Tarefa Solicitadas
$ARGUMENTS