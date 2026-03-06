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
