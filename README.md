# MigrationGuard

Reviews Postgres migrations before they reach production. It flags risky operations (locks, table rewrites, data loss, breaking renames, missing indexes) and proposes safer multi-step alternatives.

Runs entirely locally: static analysis only. It never executes SQL, never connects to a database and makes no network calls.

Ships as a CLI, an MCP server and a Claude Code plugin (`/migration-review`). Phase 1 supports **PostgreSQL** with raw `.sql` files and **Prisma** migration folders (`prisma/migrations/*/migration.sql`).

> MigrationGuard never says a migration is "safe". With no findings it means only: no known risky patterns were found.

## Install

Requires Node 20+. Once published to npm:

```bash
npx migrationguard analyze prisma/migrations
```

From a clone (until then):

```bash
pnpm install && pnpm build
node packages/cli/dist/index.js analyze fixtures/prisma-project
```

## CLI

```bash
migrationguard analyze <path> [--format markdown|json] [--min-severity high|medium|low|info] [--disable MG004,MG012]
```

`<path>` is a `.sql` file or a folder (a Prisma `migrations` folder or any folder of `.sql` files).

| Exit code | Meaning                                       |
| --------- | --------------------------------------------- |
| 0         | No high-severity findings (after filters)     |
| 1         | At least one high-severity finding            |
| 2         | Usage error, missing file, or SQL parse error |

`--format json` prints a `Report`: `{ summary: { files, high, medium, low, info }, findings: [...] }`. Files that fail to parse are listed under an extra `errors` key, only when there are any.

## MCP server

```bash
claude mcp add migrationguard -- npx migrationguard-mcp
# from a clone:
claude mcp add migrationguard -- node /path/to/migrationguard/packages/mcp-server/dist/index.js
```

Paths are resolved against `MIGRATIONGUARD_ROOT` (default: the current directory). Paths outside it, including via `..` or symlinks, are rejected. All tools are read-only.

| Tool                       | Input                   | Output                             |
| -------------------------- | ----------------------- | ---------------------------------- |
| `analyze_migration`        | `{ path }`              | `Report` for one file              |
| `analyze_directory`        | `{ path }`              | `Report` for a migrations folder   |
| `suggest_safe_alternative` | `{ ruleId, statement }` | `SafeAlternative`                  |
| `list_rules`               | `{}`                    | id, title, severity for every rule |
| `explain_rule`             | `{ ruleId }`            | full explanation                   |

Errors come back as `{ "error": { "code", "message" } }` (`PARSE_ERROR`, `UNKNOWN_RULE`, `NOT_FOUND`, `NOT_A_FILE`, `NOT_A_DIRECTORY`); the server does not crash on bad input.

## Claude Code plugin

The [plugin/](plugin/) folder holds the `/migration-review [path]` command and a skill that makes Claude review migrations as it writes them. Register the MCP server first (above), then load the plugin from `plugin/`.

## Rules

| ID    | Detects                                                  | Severity |
| ----- | -------------------------------------------------------- | -------- |
| MG001 | `ADD COLUMN ... NOT NULL` without a default              | high     |
| MG002 | `CREATE INDEX` without `CONCURRENTLY`                    | high     |
| MG003 | `DROP COLUMN`                                            | high     |
| MG004 | `RENAME COLUMN` / `RENAME TABLE`                         | high     |
| MG005 | `ALTER COLUMN TYPE` that may rewrite the table           | high     |
| MG006 | `ADD FOREIGN KEY` without `NOT VALID`                    | medium   |
| MG007 | `ADD CHECK` / `ADD UNIQUE` that scans or locks the table | medium   |
| MG008 | Foreign key column with no supporting index              | medium   |
| MG009 | `DROP TABLE`                                             | high     |
| MG010 | `ADD COLUMN` with a volatile default                     | high     |
| MG011 | `SET NOT NULL` on an existing column                     | medium   |
| MG012 | No `lock_timeout` before `ALTER TABLE`                   | low      |

Table size is unknown, so findings say a statement "may lock or rewrite a large table", never how long it will take. Each rule's `explain_rule` text states the Postgres behaviour it relies on and the minimum version.

## What this does not catch

Honest limits; rules prefer missing a finding over a false alarm.

- **One file at a time.** MG008 and MG011 only see the current file, so they can false-positive when the supporting index or CHECK constraint was added in an earlier migration. MG001, MG004 and others ignore tables created earlier in the same file (new tables are cheap) but cannot know about tables from other files.
- **No table sizes or lock times.** Without a database connection there is no way to tell a 10-row table from a 10-billion-row one.
- **MG005** skips `text`/`varchar` changes with no `USING` clause, because the old type is not visible, so it can miss some rewrites.
- **MG010** knows built-in volatile functions (and serial types) only; volatile user-defined functions are not detected.
- **`DO $$ ... $$` blocks** are one opaque statement and are not analysed.
- **Parse errors** have no line number; a file that does not parse is reported as an error and gets no findings.
- **Application code** is not read. It cannot tell whether a dropped or renamed column is still used (planned for Phase 2).
- **Postgres only.** MySQL, Alembic and Knex are not supported yet. Behaviour is described for Postgres 11+.
- It cannot know your migration tool's transaction wrapping beyond explicit `BEGIN`/`COMMIT` in the file.

## Development

```bash
pnpm install
pnpm build
pnpm lint
pnpm test          # unit + fixture tests
pnpm test:e2e      # built CLI and MCP server (run after build)
```

Layout: `packages/core` (parser, rules, reports; pure), `packages/cli`, `packages/mcp-server`, `plugin/`, `fixtures/` (see [fixtures/README.md](fixtures/README.md)). Parser choice: [docs/parser.md](docs/parser.md).

## License

MIT
