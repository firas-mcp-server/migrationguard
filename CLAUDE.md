# MigrationGuard

MigrationGuard reviews database migrations before they reach production. It parses migration files, flags risky operations (locks, data loss, breaking renames, missing indexes), and proposes safer multi-step alternatives. It ships as an MCP server, a Claude Code skill with a `/migration-review` slash command, and a CLI.

Business model: open-core. The free tier (MIT) is local static analysis. The Pro tier (separate license, built later) adds a read-only staging DB connection, a GitHub Action for PR comments, and custom team rules.

---

## 1. Scope

### Phase 1 (MVP, build this first)
- **Databases:** PostgreSQL only.
- **Migration formats:** raw `.sql` files and Prisma migration folders (`prisma/migrations/*/migration.sql`).
- **Surfaces:** core library, CLI, MCP server, Claude Code skill and slash command.
- **Output:** Markdown report and JSON report.

### Phase 2
- MySQL rules, Alembic and Knex support (Python and JS migration files, best-effort parsing).
- `check_code_references` (find code that still uses a column being dropped or renamed).

### Phase 3 (Pro, do NOT build until told to)
- Read-only staging DB connection for table size and lock-time estimates.
- GitHub Action that comments on PRs.
- Custom rules loaded from a team config.

Do not start a later phase until the current phase's Definition of Done (section 9) is met and the human confirms.

---

## 2. Tech stack

- Node.js 20+, TypeScript (strict mode), pnpm workspaces
- `@modelcontextprotocol/sdk` for the MCP server
- `zod` for tool input schemas and config validation
- `vitest` for tests, `tsup` for builds, `eslint` and `prettier` for lint and format
- SQL parsing: use a real Postgres parser (for example `libpg-query` or `pgsql-parser`). Verify the package exists and installs on Node 20 before committing to it. Do not parse SQL with regexes except as a documented fallback.

Check every dependency exists on npm before adding it. Never invent package names or APIs. If unsure, read the package README or types.

---

## 3. Repository layout

```
migrationguard/
├── CLAUDE.md
├── package.json
├── pnpm-workspace.yaml
├── packages/
│   ├── core/            # parsers, rules engine, report generation (pure, no I/O side effects)
│   │   └── src/
│   │       ├── types.ts         # SHARED CONTRACTS, see section 5
│   │       ├── parsers/         # sql.ts, prisma.ts
│   │       ├── rules/           # one file per rule, plus index.ts registry
│   │       ├── report/          # markdown.ts, json.ts
│   │       └── extension-points.ts  # interfaces for Pro features (no implementation)
│   ├── cli/             # `migrationguard` command
│   └── mcp-server/      # MCP tools wrapping core
├── plugin/
│   ├── skills/migration-review/SKILL.md
│   └── commands/migration-review.md
├── fixtures/
│   ├── safe/            # migrations that must produce zero findings
│   ├── risky/           # migrations that must trigger specific rule IDs
│   └── README.md
├── docs/
└── .github/workflows/ci.yml
```

`packages/pro/` does not exist yet. Never place Pro functionality in `core`, `cli`, or `mcp-server`.

---

## 4. Rules (Phase 1, Postgres)

Each rule is one file exporting a `Rule` object (see types). Every rule needs at least one `risky` fixture that triggers it and one `safe` fixture that does not.

| ID | Detects | Severity | Safer alternative |
|----|---------|----------|-------------------|
| MG001 | `ADD COLUMN ... NOT NULL` without a default on an existing table | high | Add nullable, backfill in batches, then `SET NOT NULL` (via a validated CHECK constraint on large tables) |
| MG002 | `CREATE INDEX` without `CONCURRENTLY` | high | `CREATE INDEX CONCURRENTLY` (must run outside a transaction) |
| MG003 | `DROP COLUMN` | high | Stop reading and writing the column in code, deploy, then drop in a later migration |
| MG004 | `RENAME COLUMN` or `RENAME TABLE` | high | Expand and contract: add new, dual-write, backfill, switch reads, drop old |
| MG005 | `ALTER COLUMN TYPE` that forces a table rewrite | high | New column, backfill, swap |
| MG006 | `ADD FOREIGN KEY` without `NOT VALID` | medium | `ADD CONSTRAINT ... NOT VALID`, then `VALIDATE CONSTRAINT` separately |
| MG007 | `ADD CHECK` or `ADD UNIQUE` that scans or locks the table | medium | `NOT VALID` plus `VALIDATE`, or a unique index built concurrently |
| MG008 | Foreign key column with no supporting index | medium | Add index concurrently |
| MG009 | `DROP TABLE` | high | Rename to a tombstone name first, drop after a retention window |
| MG010 | `ADD COLUMN` with a volatile default (rewrites the table) | high | Add without default, backfill, then set the default |
| MG011 | `SET NOT NULL` on an existing column | medium | CHECK constraint `NOT VALID`, validate, then `SET NOT NULL` |
| MG012 | No `lock_timeout` set before `ALTER TABLE` | low | `SET lock_timeout = '5s'` at the top of the migration |

Accuracy rules:
- Do not claim a statement is dangerous if it is not. Example: `ADD COLUMN` with a constant default is fast on Postgres 11+. False positives destroy trust, so prefer missing a finding over crying wolf.
- Table size is unknown in the free tier. Word findings as "may lock or rewrite a large table", never as a fact about lock duration.
- Each rule's `explain` text must state the Postgres behaviour it relies on and the minimum Postgres version if relevant.

---

## 5. Shared contracts (`packages/core/src/types.ts`)

The architect agent writes and freezes this file first. All other agents code against it. Changes go through the architect.

```ts
export type Severity = "high" | "medium" | "low" | "info";
export type Dialect = "postgres"; // mysql added in Phase 2

export interface Finding {
  ruleId: string;            // "MG001"
  severity: Severity;
  message: string;
  file: string;
  line: number;
  statement: string;         // the offending SQL, trimmed
  explanation: string;       // why it is risky
  safeAlternative?: SafeAlternative;
}

export interface SafeAlternative {
  summary: string;
  steps: { title: string; sql?: string; note?: string }[];
}

export interface Rule {
  id: string;
  title: string;
  severity: Severity;
  dialect: Dialect;
  explain: string;
  check(ctx: RuleContext): Finding[];
}

export interface RuleContext {
  file: string;
  statements: ParsedStatement[];
  dialect: Dialect;
  options: AnalyzeOptions;
}

export interface AnalyzeOptions {
  dialect: Dialect;
  disabledRules?: string[];
  minSeverity?: Severity;
}

export interface Report {
  summary: { files: number; high: number; medium: number; low: number; info: number };
  findings: Finding[];
}
```

`extension-points.ts` defines interfaces only (for example `LockEstimator`, `RuleLoader`) so Pro can plug in later without changing core. No implementations in the free packages.

---

## 6. MCP server tools

Implement in `packages/mcp-server`. All inputs validated with zod. All tools are read-only.

| Tool | Input | Output |
|------|-------|--------|
| `analyze_migration` | `{ path: string, dialect?: "postgres" }` | `Report` for one file |
| `analyze_directory` | `{ path: string, dialect?: "postgres" }` | `Report` for a migrations folder |
| `suggest_safe_alternative` | `{ ruleId: string, statement: string }` | `SafeAlternative` |
| `list_rules` | `{}` | id, title, severity for every rule |
| `explain_rule` | `{ ruleId: string }` | full explanation |
| `check_code_references` | Phase 2 | not in Phase 1 |

Server requirements:
- Never execute SQL and never connect to any database in the free tier.
- Never read files outside the path the user provides. Resolve paths and reject traversal outside the project root.
- Return structured errors with a helpful message when a file cannot be parsed. Never crash the server on bad input.
- Startable with `npx migrationguard-mcp` and registerable via `claude mcp add migrationguard -- npx migrationguard-mcp`.

---

## 7. Claude Code plugin

- `plugin/commands/migration-review.md`: the `/migration-review [path]` slash command. It calls `analyze_directory` (or `analyze_migration` for a single file), then presents findings grouped by severity, with the safe alternative for each high-severity finding.
- `plugin/skills/migration-review/SKILL.md`: instructs Claude when to run a review automatically (when a migration file is created or edited), how to interpret findings, and to never claim a migration is "safe" (only that no known risky patterns were found).

---

## 8. Ruflo orchestration

This project is built with Ruflo (multi-agent orchestration for Claude Code). Ruflo's CLI init installs the MCP server and hooks; the plugin-only install gives slash commands and agent definitions but not the MCP tools. If Ruflo tools such as `memory_store`, `memory_search`, `swarm_init`, or `agent_spawn` are unavailable, tell the human instead of pretending they worked.

### Setup (human runs once)
```bash
npx ruflo@latest init
claude mcp add ruflo -- npx ruflo@latest mcp start
```

### Swarm configuration
- Topology: hierarchical, max 6 agents.
- Initialize with: `npx ruflo@latest swarm init --topology hierarchical --max-agents 6`

### Agent roles and ownership

| Agent | Owns | Must not touch |
|-------|------|----------------|
| **architect** (coordinator) | `types.ts`, `extension-points.ts`, repo config, task breakdown, merge decisions | rule logic |
| **parser-dev** | `packages/core/src/parsers/`, parser tests | rules, MCP |
| **rules-dev** | `packages/core/src/rules/`, `fixtures/` | parsers, MCP |
| **mcp-dev** | `packages/mcp-server/`, `packages/cli/`, `plugin/` | rules, parsers |
| **tester** | test suites, CI workflow, fixture coverage checks | production code except to report bugs |
| **reviewer** | read-only review of every change against sections 4, 6, and 10 | writes nothing except review notes |

Optional 7th role for documentation (README, docs/) once Phase 1 works.

### Coordination rules
1. The architect writes `types.ts` before any other agent starts writing code.
2. Agents work only in the directories they own. Cross-boundary changes are requested through the architect.
3. Before starting a task, run `memory_search` for prior decisions. After any design decision (parser choice, rule wording, naming), run `memory_store` with a short entry so later sessions keep context.
4. Work in parallel where dependencies allow: parser-dev and mcp-dev can start once `types.ts` is frozen (mcp-dev codes against the core interface with stubs); rules-dev starts as soon as the parser output shape is agreed.
5. The reviewer approves before the architect marks a task done.
6. Do not enable autonomous unattended loops (autopilot) for this project until Phase 1 tests are green. Run supervised.

---

## 9. Definition of Done

### Phase 1
- [ ] `pnpm install && pnpm build && pnpm test` passes from a clean clone.
- [ ] Rules MG001 to MG012 implemented, each with at least one risky and one safe fixture.
- [ ] All `fixtures/safe/*` produce zero findings; every `fixtures/risky/*` triggers exactly its expected rule IDs (assert in tests).
- [ ] `migrationguard analyze <path>` prints a readable Markdown report; `--format json` prints valid JSON matching `Report`.
- [ ] MCP server starts, `list_rules` and `analyze_directory` work when tested from Claude Code.
- [ ] `/migration-review` works end to end on a sample Prisma project.
- [ ] README covers install, usage, list of rules, and an honest "what this does not catch" section.
- [ ] Package `bin` entries and `files` are set so `npx` works after publishing.

---

## 10. Code standards and guardrails

- TypeScript strict, no `any` without a comment explaining why.
- Core is pure: functions take input and return output. File and network I/O lives in CLI and MCP layers.
- Small, focused files. One rule per file. Every exported function has a test.
- Conventional commits (`feat:`, `fix:`, `test:`, `docs:`).
- No secrets, tokens, or real database credentials anywhere in the repo or fixtures.
- Never run generated migrations or any SQL against a real database.
- Never add telemetry or network calls to the free tier.
- Licensing: free packages are MIT. Do not add Pro code or Pro-only dependencies to them.
- When a request is ambiguous or a design decision is significant (parser library, output format changes), stop and ask the human instead of guessing.
- Prefer honest limits over clever heuristics. If a rule cannot be certain, downgrade its severity or wording.

---

## 11. Commands

```bash
pnpm install          # install deps
pnpm build            # build all packages
pnpm test             # run all tests
pnpm test:fixtures    # run fixture assertions only
pnpm lint             # eslint + prettier check
pnpm dev:mcp          # run MCP server locally
```

---

## 12. Kickoff prompt (paste into Claude Code after init)

> Read CLAUDE.md fully. Initialize the Ruflo swarm as described in section 8. As architect: (1) scaffold the pnpm monorepo per section 3, (2) write and freeze `packages/core/src/types.ts` per section 5, (3) store the key decisions in memory, then (4) assign parser-dev, rules-dev, mcp-dev, and tester their first tasks for Phase 1 and run them in parallel. Report a short plan before writing code, and stop for my confirmation at the end of Phase 1.