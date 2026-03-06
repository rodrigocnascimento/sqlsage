# Rule: Release Governance with Explicit Approval (RGEA)

## Context

To maintain release safety, auditability, and predictable version history, every completed task must go through an explicit approval flow before any version bump or changelog update is performed.

This rule establishes mandatory governance for task finalization and release execution.

---

## 1) Approval Before Release Is Mandatory

After completing any implementation, fix, refactor, or feature, the system MUST NOT:
- bump version
- update `CHANGELOG.md`
- prepare release metadata as executed work
- create commit or tag automatically

until the Developer explicitly approves the delivered changes.

---

## 2) Mandatory Review Command Before Release

Before any release-related action, the system MUST first run the task review flow through:

- `/finish-task`

This review step must produce:
- summary of delivered work
- main files changed
- change classification
- current version
- recommended bump
- next version
- explicit approval request

If this review step has not happened in the current context, `/release` MUST NOT proceed.

---

## 3) Mandatory Approval Question

At the end of the review flow, the system MUST ask exactly:

"Do you approve these changes and the proposed version bump, Developer?"

The system must then stop and wait for explicit approval.

---

## 4) Release Execution Requires Explicit Approval

The release flow may only proceed through:

- `/release`

and only if the Developer has explicitly approved the reviewed work in the current context.

Valid examples of explicit approval include direct confirmations such as:
- yes
- approved
- ok
- proceed
- sim
- aprovado

If approval is denied, unclear, or absent, the release flow MUST stop.

---

## 5) Mandatory Release Actions After Approval

Once approval is explicit, the system MUST:
1. identify the official version source
2. apply the correct semantic version bump
3. update `CHANGELOG.md`
4. validate consistency between version source and changelog
5. provide release metadata summary

---

## 6) Semantic Versioning Policy

The system MUST use Semantic Versioning as default:

- `fix` -> PATCH
- `feat` -> MINOR
- `breaking change` -> MAJOR

If classification is uncertain, the system must expose the uncertainty before requesting approval.

---

## 7) Git Safety Restrictions

Even after approval, the system MUST NOT automatically:
- commit
- tag
- push
- publish

unless the Developer explicitly requests those actions.

It may only prepare suggested release metadata, such as:
- commit message
- tag name

---

## 8) Source of Truth for Version

The system MUST identify the official version source using this priority order:
1. `package.json`
2. `composer.json`
3. `pyproject.toml`
4. `Cargo.toml`
5. another project-defined version source

`CHANGELOG.md` must never be treated as the only source of truth if an official manifest exists.

---

## 9) Changelog Rules

When updating `CHANGELOG.md`, the system MUST:
- add the newest entry at the top
- include the new version
- include the current date in `YYYY-MM-DD`
- use only applicable sections:
  - Added
  - Changed
  - Fixed
  - Removed
- describe only real delivered changes

---

## 10) Strict Order of Execution

The mandatory order is:

1. Task implementation
2. `/finish-task`
3. Explicit approval
4. `/release`

Skipping steps is not allowed.

If any step is missing, the system must stop and indicate the required previous step.