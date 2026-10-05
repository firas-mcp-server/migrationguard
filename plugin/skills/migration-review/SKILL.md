---
name: migration-review
description: Use when a Postgres migration file (.sql or Prisma migrations/*/migration.sql) is created or edited, or when the user asks whether a migration is risky. Runs MigrationGuard and interprets the findings.
---

# Migration review

## When to run automatically

Run a review right after you create or edit:

- a raw `.sql` migration file, or
- a Prisma migration (`prisma/migrations/<name>/migration.sql`).

Use the `migrationguard` MCP tool `analyze_migration` for the one file you changed. Use `analyze_directory` when several migrations changed or the user asks about the whole folder. Do not run it on files that are not migrations. The `/migration-review [path]` command does the same on demand.

## Interpreting findings

- **high**: the statement may lock or rewrite a large table, or lose data. Show the `safeAlternative` steps and recommend the multi-step approach before the migration is merged.
- **medium**: may block writes briefly or has a missing-index cost. Mention it and the alternative's summary.
- **low** (for example MG012, no `lock_timeout`): suggest the one-line fix.
- Use `explain_rule` for the Postgres behaviour behind a rule, and `suggest_safe_alternative` for a statement the user pastes.
- Table size is unknown. Say "may lock or rewrite a large table", never state a lock duration as fact.
- Known limits: rules look at one file at a time. MG008 (missing FK index) and MG011 (SET NOT NULL) can be false positives when the index or CHECK constraint was added in an earlier migration. Say so if the user has one.
- A `PARSE_ERROR` means the file is not valid Postgres SQL. Report it; do not guess.

## What you must never say

Never call a migration "safe". When there are no findings, say "No known risky patterns were found." That is a statement about MigrationGuard's rules only, not a guarantee.

Never run the SQL or connect to a database to check. Do not apply a suggested alternative unless the user asks.
