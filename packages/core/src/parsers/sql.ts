import { parse } from "libpg-query";
import type { ParsedStatement } from "../types.js";

export class SqlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqlParseError";
  }
}

// Leading whitespace and comments that libpg-query includes before a statement's text.
const LEADING_NOISE = /^(?:\s+|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/;

interface RawStmt {
  stmt?: Record<string, unknown>;
  stmt_location?: number;
  stmt_len?: number;
}

/** Parses Postgres SQL into statements with 1-based start lines. Throws SqlParseError on invalid SQL. */
export async function parseSql(sql: string): Promise<ParsedStatement[]> {
  let raw: { stmts?: RawStmt[] };
  try {
    raw = (await parse(sql)) as { stmts?: RawStmt[] };
  } catch (e) {
    throw new SqlParseError(e instanceof Error ? e.message : String(e));
  }

  let inTransaction = false;
  const out: ParsedStatement[] = [];
  for (const s of raw.stmts ?? []) {
    const start = s.stmt_location ?? 0;
    const end = s.stmt_len ? start + s.stmt_len : sql.length;
    const text = sql.slice(start, end);
    const offset = start + (LEADING_NOISE.exec(text)?.[0].length ?? 0);
    const body = sql.slice(offset, end).trim().replace(/;$/, "").trim();

    const kind = (s.stmt?.["TransactionStmt"] as { kind?: string } | undefined)?.kind;
    if (kind === "TRANS_STMT_BEGIN" || kind === "TRANS_STMT_START") inTransaction = true;

    out.push({
      sql: body,
      line: 1 + (sql.slice(0, offset).match(/\n/g)?.length ?? 0),
      inTransaction,
      ast: s.stmt,
    });

    if (kind === "TRANS_STMT_COMMIT" || kind === "TRANS_STMT_ROLLBACK") inTransaction = false;
  }
  return out;
}
