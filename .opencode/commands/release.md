---
description: Executar release update após aprovação explícita
agent: plan
---

Siga o protocolo de Release Update Pós-Aprovação:

## 1. Pré-condição obrigatória
Este comando só pode prosseguir se houver aprovação explícita prévia do Developer para:
- as mudanças entregues
- o version bump proposto

Se não houver aprovação explícita no contexto atual, PARE e informe exatamente:

"Explicit approval is required before running the release update."

## 2. Validar fluxo correto
Antes de prosseguir, verifique se houve um resumo prévio da entrega no contexto atual.

Se não houver evidência clara de revisão prévia da tarefa, PARE e informe exatamente:

"Run /finish-task before /release so the work can be reviewed and approved first."

## 3. Identificar a origem da versão
Localize a fonte oficial da versão do projeto, seguindo esta ordem de prioridade:
1. `package.json`
2. `composer.json`
3. `pyproject.toml`
4. `Cargo.toml`
5. outro manifesto/version file do projeto

Se nenhuma origem confiável for encontrada, pare e informe isso claramente.

## 4. Determinar o tipo de bump
Use a classificação já aprovada:
- `fix` -> PATCH
- `feat` -> MINOR
- `breaking change` -> MAJOR

Se a classificação aprovada não estiver clara, pare e informe a inconsistência antes de alterar arquivos.

## 5. Atualizar versão
Atualize a versão na fonte oficial identificada.

Se houver outros arquivos que devam refletir a mesma versão, atualize-os também para manter consistência.

## 6. Atualizar `CHANGELOG.md`
Atualize o arquivo `CHANGELOG.md` adicionando a nova entrada no topo com:
- nova versão
- data atual no formato `YYYY-MM-DD`
- categorias aplicáveis:
  - Added
  - Changed
  - Fixed
  - Removed

Formato esperado:

```md
## [<new-version>] - <YYYY-MM-DD>

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Removed
- ...
```

Regras:

entrada mais recente no topo não inventar categorias vazias descrever somente mudanças reais da entrega manter texto objetivo e curto

## 7. Validar consistência

Após atualizar a versão e o changelog, valide: se a nova versão está consistente em todos os arquivos relevantes se o changelog corresponde ao que foi entregue se o bump aplicado corresponde ao tipo aprovado

## 8. Preparar release metadata

Ao final, fornecer: versão anterior nova versão arquivos alterados no release update sugestão de commit message sugestão de tag

Formato sugerido:

Commit: chore(release): bump version to <new-version>

Tag: v<new-version>

## 9. Regras obrigatórias

- Nunca executar este comando sem aprovação explícita 
- Nunca fazer push automaticamente
- Nunca criar tag ou commit automaticamente, a menos que isso seja solicitado explicitamente
- Nunca atualizar changelog sem atualizar a versão oficial
 
Se CHANGELOG.md não existir, crie-o somente neste momento

Tarefa Solicitada

$ARGUMENTS