# AGENTS.md - Development Guidelines for sql-ml-cli

## Project Overview

This is a Node.js CLI tool built with TypeScript that analyzes SQL files using ML-based query performance prediction powered by TensorFlow.js.

## Build, Lint, and Test Commands

### Build
```bash
npm run build     # Compile TypeScript to JavaScript (outputs to dist/)
```

### Run
```bash
npm run dev       # Run with tsx (development)
npm run start     # Run compiled JavaScript from dist/
npm run analyze   # Run analyze command: npm run analyze -- <file.sql>
```

### Test
```bash
npm run test           # Run tests once
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

**Running a single test**: Use `vitest run --testNamePattern <name>` or run a specific test file with `vitest run src/services/ml/engine/feature-engineer.test.ts`

**Current Coverage**: ~95% (109 tests)

### Type Checking
```bash
npx tsc --noEmit  # Run TypeScript type checking without emitting
```

## Code Style Guidelines

### General
- Use ES Modules (`"type": "module"` in package.json)
- Always include `.js` extension in relative imports (e.g., `./service.js`)
- Use 2 spaces for indentation
- Use single quotes for strings
- Use semicolons at the end of statements

### Imports
```typescript
// External imports first, then local
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { MLPredictionService } from './services/ml-prediction.service.js';
```

### TypeScript
- **Always enable strict mode** - tsconfig has `"strict": true`
- Define explicit return types for functions
- Use interfaces for object shapes, prefixed with `I` (e.g., `ISQLInsight`)
- Use `unknown` for caught errors, then narrow with type guards

### Naming Conventions
- **Classes**: PascalCase (e.g., `MLPredictionService`)
- **Interfaces**: PascalCase with `I` prefix (e.g., `ISQLInsight`)
- **Functions/variables**: camelCase (e.g., `getStatus()`, `const sql = ...`)
- **Constants**: UPPER_SNAKE_CASE for compile-time constants
- **Files**: kebab-case (e.g., `ml-prediction.service.ts`)

### Error Handling
```typescript
try {
  // ... operation
} catch (error) {
  console.error('Error:', error instanceof Error ? error.message : error);
  process.exit(1);
}
```

### Logging
- Use `console.log` for general output
- Use `console.error` for errors
- Prefix module-specific logs with brackets: `[MLPredictionService] Engine initialized`
- Use `--verbose` flag pattern for detailed output (see src/index.ts)

### Project Structure
```
src/
  index.ts              # CLI entry point (commander)
  services/
    ml-prediction.service.ts   # Main prediction service
    ml/
      engine/
        index.ts              # MLQueryEngine
        model.ts              # TensorFlow.js model
        feature-engineer.ts   # SQL feature extraction
        schema-registry.ts    # Schema knowledge
        types.ts              # TypeScript interfaces
```

### TensorFlow.js Usage
- Import via named imports: `import * as tf from '@tensorflow/tfjs'`
- Always dispose tensors after use to prevent memory leaks
- Use async/await for model operations

### SQL Analysis Patterns
- Feature extraction returns normalized values (0-1 range)
- Performance scores are 0-1 (multiply by 100 for display as percentage)
- Insights include: PERFORMANCE_BOTTLENECK, ANTI_PATTERN, SYNTAX_OPTIMIZATION, SCHEMA_SUGGESTION

<!-- BEGIN OPENCODE AUTO -->
# 🔒 Compiled OpenCode Configuration

> Auto-generated. Do not edit manually.



## agents/code-review.md

---
description: Revisa código para qualidade e melhores práticas
mode: subagent
model: opencode/big-pickle
temperature: 0.1
tools:
  write: false
  edit: false
  bash: false
---

Você está no modo de revisão de código. Foque em:

- Qualidade do código e melhores práticas
- Bugs potenciais e casos de borda
- Implicações de desempenho
- Considerações de segurança

Forneça feedback construtivo sem fazer alterações diretas.

## commands/tdp.md

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

## rules/10-no-pull-main.md

# Rule: Protected Branch Guard (PBG)

## Context

To prevent accidental production instability and preserve repository integrity, **no changes may be pushed, merged, rebased, or committed directly to `main` or `master` without explicit developer approval**.

These branches are considered **protected production branches**.

This rule overrides convenience. Stability takes precedence over speed.

---

## Protected Branches

The following branches are permanently protected:

* `main`
* `master`

If additional protected branches exist (e.g., `stable`, `production`), they must be treated the same way.

---

## The Protocol

Whenever a task would result in changes affecting `main` or `master`, you MUST:

### 1. Detect Branch Context

Before any git operation, verify the current branch:

```bash
git branch --show-current
```

If current branch is:

* `main`
* `master`

You MUST enter **Protection Mode**.

---

### 2. Protection Mode (Mandatory Stop)

You MUST NOT:

* Commit directly
* Merge into
* Rebase onto
* Push to
* Force push to
* Cherry-pick into

`main` or `master`

Instead, you MUST output:

> "You are currently on a protected branch (`main`/`master`). Direct modifications are blocked."

---

### 3. Mandatory Developer Confirmation

You MUST explicitly ask:

> "Do you authorize changes directly to `<branch-name>`?"

And WAIT for a clear confirmation such as:

* "Yes, proceed"
* "I approve"
* "Authorized"

No implicit approval is valid.

---

### 4. If No Explicit Approval

If approval is not explicitly granted:

* STOP immediately.
* Suggest creating a feature branch instead:

  * `feat/<slug>`
  * `fix/<slug>`

Provide the exact safe alternative:

```bash
git checkout -b feat/<feature-slug>
```

---

### 5. If Explicit Approval Is Granted

Only after explicit authorization, you may proceed with:

* Commit
* Merge
* Push

But you MUST still:

* Avoid force push unless explicitly authorized.
* State clearly:

> "Proceeding with authorized changes on protected branch `<branch-name>`."

---

## Hard Execution Gate

Under no circumstances may the system:

* Auto-commit to `main`
* Auto-merge into `master`
* Auto-push to protected branches
* Perform force operations

Without explicit developer confirmation.

---

## Security Principle

Protected branches are treated as **production infrastructure**.

Unauthorized modification = architectural violation.

Stability > velocity.

## rules/20-new-branch-feature.md

# Rule: Stable-Base Branching for Every New Feature (SBB)

## Context

To ensure predictable releases, avoid integration drift, and keep features isolated, **every new feature must be developed in its own branch created from the most stable branch available**.

This rule is complementary to the **Mandatory Technical Design Phase (TDP)**: no code is written before a TDD exists, and now **no feature work starts before the correct branch exists**.

## Definitions

### Stable Branch (Source of Truth)

The **most stable branch** is defined by this priority order:

1. `stable` (if it exists)
2. `main` (if it exists)
3. `master` (if it exists)
4. The branch explicitly marked in repository docs as stable

If more than one exists, select the highest priority found.

## The Protocol

Whenever the user requests a **new feature** (not a trivial doc change), you MUST do the following **in order**:

### 1. Identify the Stable Base

* Determine which branch is the **stable branch** using the priority order above.
* If branch detection is not possible, default to `main`.
* You MUST state explicitly in the output:

> “Stable base branch selected: `<branch-name>`”

### 2. Ensure the Stable Base is Up-to-date

Before creating the feature branch, the workflow MUST include:

* `git fetch --all --prune`
* `git checkout <stable-branch>`
* `git pull --ff-only`

If `--ff-only` fails, STOP and report the conflict/divergence and request manual intervention.

### 3. Create the Feature Branch (Mandatory)

You MUST create a new branch from the stable base **before** generating any implementation code.

#### Naming Standard (Mandatory)

Use exactly one of:

* `feat/<feature-slug>`
* `feature/<feature-slug>`

Where `<feature-slug>` is lowercase, kebab-case, no spaces, e.g.:

* `feat/todo-due-indicators`
* `feat/sqlite-task-status`

You MUST output the exact command sequence:

* `git checkout -b feat/<feature-slug>`

### 4. Apply the Existing TDP Rule

After branch creation, you MUST follow **Mandatory Technical Design Phase (TDP)**:

* Generate the TDD in **`docs/tdd-<feature-slug>.md`**
* STOP and ask:

> “Do you approve this technical approach, Developer?”

### 5. Execution Gate

**HARD STOP CONDITIONS** (do not proceed to code):

* If the stable base branch is not confirmed or not updated.
* If the feature branch was not created.
* If the TDD was not produced in `docs/`.
* If explicit approval was not given.

## Notes

* Bugfixes may use `fix/<slug>` but still must branch from stable.
* Hotfixes may use `hotfix/<slug>` but still must branch from stable.
* No direct commits to stable branches (`main/master/stable`) are allowed for feature work.

## rules/30-no-push-forcce.md

# Rule: Git Governance System (GGS)

## Context

To maintain release safety, auditability, and predictable collaboration, the repository must follow a strict governance protocol for:

* Force operations
* Protected branch updates (`main`/`master`)
* Branch naming
* Commit message standards

This rule stacks on top of:

* Stable-Base Feature Branching (SBB)
* Protected Branch Guard (PBG)

If any rule conflicts, the strictest restriction wins.

---

## 1) Force Operations Are Blocked by Default

### Forbidden without explicit authorization

The system MUST NOT execute any of the following unless the developer explicitly authorizes it:

* `git push --force`
* `git push -f`
* `git push --force-with-lease`
* `git reset --hard` (when it rewrites shared history)
* `git rebase` (if it affects remote-tracked/shared branches)

### Mandatory Stop + Ask

Before any force-like operation, you MUST STOP and ask:

> "Force operation detected (`<operation>`). Do you explicitly authorize rewriting history on `<branch>`?"

If authorization is not explicitly granted, STOP and propose a safe alternative (new branch + PR).

---

## 2) PR-Only Policy Into Protected Branches

### Scope

Any change that ends up in:

* `main`
* `master`
  (and optionally `stable`, `production` if present)

MUST be delivered via **Pull Request / Merge Request**.

### Enforcement

The system MUST NOT:

* Merge directly into protected branches locally
* Push commits directly to protected branches
* Cherry-pick into protected branches

Unless the developer explicitly authorizes a **direct change** (and even then, prefer PR).

### Required Output

When target is a protected branch, you MUST output:

* The PR strategy (what branch merges into what)
* A checklist for PR readiness:

  * tests passing
  * lint passing
  * build passing
  * TDD exists in `docs/`
  * reviewers (if applicable)

---

## 3) Branch Naming Must Include Issue ID

### Mandatory Format

All non-protected work branches MUST include an Issue ID.

Allowed patterns:

* `feat/<issueId>-<slug>`
* `fix/<issueId>-<slug>`
* `chore/<issueId>-<slug>`
* `refactor/<issueId>-<slug>`
* `hotfix/<issueId>-<slug>`

Where:

* `<issueId>` = one of:

  * `GH-<number>` (GitHub issues), e.g. `GH-123`
  * `JIRA-<number>` (Jira key), e.g. `PROJ-42`
  * `ISSUE-<number>` (generic), e.g. `ISSUE-7`
* `<slug>` = lowercase kebab-case (no spaces)

Examples:

* `feat/GH-214-todo-due-indicators`
* `fix/ISSUE-9-sqlite-migration-order`

### If Issue ID is Missing

If the user did not provide an issue ID, you MUST NOT invent one.

You MUST:

* STOP and ask the developer to provide one, OR
* Use the generic pattern `ISSUE-<number>` ONLY if the developer explicitly gives the number.

---

## 4) Conventional Commits Are Mandatory

### Allowed Types

Commit messages MUST follow:

`<type>(<scope>): <description>`

Allowed `<type>`:

* `feat`
* `fix`
* `docs`
* `refactor`
* `test`
* `chore`
* `build`
* `ci`
* `perf`

Rules:

* `<description>` must be imperative, present tense (e.g. “add”, “fix”, “remove”)
* No trailing period
* Keep it concise

Examples:

* `feat(api): add task due status endpoint`
* `fix(ui): highlight overdue tasks in red`
* `docs(tdd): add due-indicators design`

### If the system is about to commit

Before generating the exact commit command, you MUST output the proposed commit message and ask:

> "Approve this commit message?"

If not approved, STOP and revise.

---

## Hard Execution Gates

The system MUST STOP (no code, no git ops) if any of the following is true:

* Force op requested without explicit authorization
* Target is `main/master` without PR strategy or explicit authorization
* Branch name missing Issue ID
* Commit message not Conventional Commits compliant

---

## Default Safe Workflow (Reference)

When implementing a feature:

1. Sync stable base:

* `git fetch --all --prune`
* `git checkout <stable>`
* `git pull --ff-only`

2. Create branch:

* `git checkout -b feat/<issueId>-<slug>`

3. Produce TDD in:

* `docs/tdd-<issueId>-<slug>.md`

4. Implement + commit with Conventional Commits

5. Open PR:

* source: `feat/<issueId>-<slug>`
* target: `<stable>` (usually `main`)

## rules/40-no-root-aliasses-backend.md

# Rule: Strict Relative Imports (No Root Aliases)

## Context

The use of `@/` or any custom root aliases (e.g., `~/*`, `#/*`) is strictly prohibited in backend code. Aliases often cause resolution failures during build steps, test execution (Jest/Vitest), or when using low-config tools like `ts-node` and `esbuild`.

## Strict Path Requirements

Every import statement MUST follow these constraints:

1. **Relative Navigation:**
* Use `./` for files in the same directory.
* Use `../` to move up the directory tree.


2. **Zero Aliasing:**
* Never use `@/` to reference the `src` or `root` directory.
* Even if a project configuration (like `tsconfig.json`) supports aliases, ignore them in favor of explicit relative paths.


3. **Automatic Refactoring:**
* When refactoring existing code, if you encounter an `@` alias, you must convert it to a relative path based on the current file's location.



## Path Calculation Logic

When determining the import string:

1. Identify the **Source File** (where the import lives).
2. Identify the **Target File** (the module being imported).
3. Calculate the steps to the common ancestor and build the `../` string.

## Standard Import Pattern

### ❌ Incorrect (Aliased)

```typescript
import { AuthService } from '@/services/auth.service';
import { db } from '@/config/database';
import { User } from '@/models/user.model';

``` cara o como 

### ✅ Correct (Strict Relative)

```typescript
// Example: If current file is at src/controllers/user/register.ts
import { AuthService } from '../../services/auth.service';
import { db } from '../../config/database';
import { User } from '../../models/user.model';

// Example: If current file is at src/services/auth.service.ts
import { db } from '../config/database';
import { User } from '../models/user.model';

```

## rules/50-plan-before-work.md

# Rule: Mandatory Technical Design Phase (TDP)

## Context

To ensure system integrity and prevent architectural drift, no code changes—refactors, new features, or bug fixes—shall be implemented without a prior **Technical Design Document (TDD)**. All TDDs must be targeted for the existing **`docs/`** directory (strictly plural) to maintain a single source of truth.

## The Protocol

Whenever a task is assigned, you **MUST NOT** generate implementation code immediately. Instead, provide a document following this exact structure:

### 1. Objective & Scope

* **What:** A concise summary of the requested change.
* **Why:** The technical reasoning (e.g., "Standardizing directory structure to `docs/` to fix CI/CD pathing").
* **File Target:** Explicitly state: "This document is intended for `docs/tdd-[feature-name].md`".

### 2. Proposed Technical Strategy

* **Logic Flow:** A step-by-step breakdown of the algorithmic changes.
* **Impacted Files:** A list of every file modified or created. **Note:** Ensure no new `doc/` (singular) directories are proposed.
* **Language-Specific Guardrails:**
* **TypeScript:** Define how **Type Safety** will be maintained (interfaces, DTOs, or strict null checks).
* **Shell/Go:** Define **Error Handling** strategies (e.g., `set -e`, explicit `if err != nil` checks).



### 3. Implementation Plan (The "How")

* Show brief **pseudocode** or **method signatures**.
* **Path Resolution:** Explicitly state how you will handle directory depth (e.g., "Using exactly $n$ sets of `../` to reach the target from `docs/`").
* **Naming Standards:** Ensure all new assets follow the project's existing naming conventions.

## Execution Gate

> **STOP:** After generating the TDD, you must ask: *"Do you approve this technical approach, Developer?"* > **Wait for explicit confirmation** before proceeding to code generation.

---

### Why this works for the Senior Lead:

* **Directory Discipline:** Hard-codes the requirement for the `docs/` folder, preventing redundant "doc" folders.
* **Pre-emptive Debugging:** Forces a check for Go/TypeScript safety before a single line of logic is written.
* **Audit Trail:** Every TDD becomes a permanent `.md` file in your repository.

## rules/60-migration-entity.md

# Rule: Entity + Migration Completeness and Immediate Execution (EMC-IE)

## Context

To ensure schema integrity, environment consistency, and deployment safety, **any introduction of a new database table MUST include:**

1. A corresponding TypeORM Entity file
2. A complete, production-ready migration
3. Detailed commentary inside the migration
4. Immediate execution of the migration after creation

No entity is considered valid until its migration has been created **and executed successfully**.

If any rule conflicts, the strictest restriction wins.

---

# 1) Mandatory Trigger Conditions

This rule applies whenever:

* A new entity is introduced
* A new table is created
* A join/pivot table is required
* An audit/history table is added
* A persistence model is added

---

# 2) Hard Requirements

## A) Entity File (Mandatory)

The system MUST create:

* A properly decorated `*.entity.ts` file
* Explicit `@Entity()` with table name
* Explicit `@Column()` types and nullability
* Explicit defaults
* Index decorators where appropriate
* Relation mappings with correct cascade rules
* Consistent naming strategy with project standards

---

## B) Migration File (Mandatory & Complete)

The migration MUST:

* Create the table
* Define primary key explicitly
* Define all indexes (including unique)
* Define all foreign keys with onDelete/onUpdate rules
* Define constraints (unique, check, etc.)
* Include complete `down()` rollback
* Include meaningful header comment explaining:

  * purpose of the table
  * performance considerations
  * relationship reasoning
  * production safety considerations

Auto-generated migrations MUST be reviewed and enhanced before acceptance.

---

# 3) Immediate Execution Requirement (NEW – Mandatory)

After generating or creating the migration, the system MUST:

1. Output the exact command required to run the migration
2. Execute it (if shell access is enabled)
3. Confirm successful execution

### Required command (based on your project standard)

For your backend (from AGENTS.md):

```
npm run migration:run
```

### Execution Protocol

After migration creation:

You MUST output:

> "Running migration to ensure schema consistency..."

Then execute:

* `npm run migration:run`

If execution fails:

* STOP immediately
* Output the error
* Do NOT proceed with any feature implementation
* Request developer intervention

No implementation code is considered valid until the migration has been successfully applied.

---

# 4) Execution Order (Strict Sequence)

Whenever a new table is requested:

1. Confirm schema design
2. Create Entity file
3. Create Migration file
4. Review migration completeness
5. Run migration immediately
6. Confirm success
7. Only then proceed with feature implementation

---

# 5) Hard Stop Conditions

The system MUST STOP if:

* Entity exists but no migration exists
* Migration exists but has not been executed
* Migration execution failed
* Migration lacks indexes, constraints, or rollback
* Migration and entity definitions diverge

When stopping, the system MUST:

* Identify the missing step
* Provide corrective action
* Refuse to proceed until resolved

---

# 6) Definition of Done (Database Changes)

A database-related feature is considered complete ONLY IF:

* [ ] Entity file exists and follows standards
* [ ] Migration file exists and is fully defined
* [ ] Migration includes commentary
* [ ] Migration executed successfully
* [ ] Application boots without schema errors

---

# Important Enforcement Clause

This rule overrides:

* Any attempt to “just create the entity”
* Any request to delay migration execution
* Any request to manually update the database outside migrations

Schema changes MUST be version-controlled and applied immediately.
<!-- END OPENCODE AUTO -->