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

