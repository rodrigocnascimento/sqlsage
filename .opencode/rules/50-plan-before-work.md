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
