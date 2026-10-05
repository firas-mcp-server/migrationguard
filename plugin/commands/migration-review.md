---
description: Review Postgres migrations for risky operations and show safer alternatives
argument-hint: "[path to a migrations folder or a single .sql file]"
---

Review database migrations with the MigrationGuard MCP server (`migrationguard`).

Target: `$ARGUMENTS`. If empty, use `prisma/migrations` if it exists, otherwise `migrations`, otherwise ask the user which path to review.

1. If the target is a directory, call `analyze_directory` with `{ "path": <target> }`. If it is a single `.sql` file, call `analyze_migration` with `{ "path": <target> }`.
2. If the tool returns `{ "error": ... }`, report the code and message as-is (for example `PARSE_ERROR` with the file) and stop. Do not guess at the contents of a file that failed to parse.
3. Present the report:
   - One line of totals (files, high, medium, low, info).
   - Findings grouped by severity: **High**, then **Medium**, then **Low**, then **Info**. For each finding show the rule ID, `file:line`, the message, and the offending statement.
   - For every **high** finding, show its `safeAlternative`: the summary, then each step with its SQL when present. If a high finding has no `safeAlternative`, call `suggest_safe_alternative` with its `ruleId` and `statement`.
   - For findings that drop or rename a column or table (MG003, MG004, MG009), also call `check_code_references` with the column or table `name` (and `table` for a column) to list code that still uses it, and show the hits. It is a plain text search: say that hits may be unrelated and that no hits does not prove the name is unused.
   - For medium and low findings, give the alternative summary only.
4. If there are no findings, say "No known risky patterns were found." Never say the migration is "safe": MigrationGuard checks a fixed set of rules on a single file at a time and cannot see table sizes or earlier migrations.
5. Wording: findings say a statement "may lock or rewrite a large table". Do not state lock durations as fact.

This command only reads files and never runs SQL. Do not apply the suggested alternatives unless the user asks.
