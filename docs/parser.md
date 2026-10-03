# SQL parser decision

**Decision:** parse Postgres SQL with [`libpg-query`](https://www.npmjs.com/package/libpg-query) 18.1.5 (MIT), the real Postgres parser compiled to WASM/native. Approved by the maintainer.

**Why:** it installs without a build step and parses identically on Node 20 and later (checked on 20.20.2 and 26.8.1). Its only dependency is `@pgsql/types`. `pgsql-parser` was rejected: it wraps `libpg-query` and adds a deparser we do not use.

## No regex fallback

Rules read the parser's AST, never regexes over SQL text. If a file does not parse, `parseSql` throws `SqlParseError` and the CLI and MCP layers report it as a structured error for that file. We do not guess at statements in unparseable SQL, because a wrong finding costs more trust than a missing one (CLAUDE.md sections 4 and 10).

The one regex in `parsers/sql.ts` only skips leading comments and whitespace so a finding's line number points at the statement. It never decides what a statement is.

## Known limits

- Syntax errors carry a message but no line number, so errors are reported per file.
- Statements inside `DO $$ ... $$` bodies are not analysed; the block is one opaque statement.
