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

