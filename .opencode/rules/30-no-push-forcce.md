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
