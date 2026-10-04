import type { Finding, ParsedStatement, Rule, RuleContext, SafeAlternative } from "../types.js";

// Minimal views over the libpg-query AST. Only the fields rules read are typed;
// the AST itself stays `unknown` in ParsedStatement so core does not depend on the parser.
export interface RangeVar {
  schemaname?: string;
  relname: string;
}

export type Str = { String?: { sval: string } };

export interface Constraint {
  contype: string;
  skip_validation?: boolean;
  /** Set for UNIQUE / PRIMARY KEY ... USING INDEX. */
  indexname?: string;
  /** Columns of a table-level UNIQUE / PRIMARY KEY. */
  keys?: Str[];
  /** Columns of a table-level FOREIGN KEY. */
  fk_attrs?: Str[];
  raw_expr?: unknown;
}

export function strs(list?: Str[]): string[] {
  return (list ?? []).flatMap((s) => (s.String ? [s.String.sval] : []));
}

export interface ColumnDef {
  colname: string;
  typeName?: { names?: { String?: { sval: string } }[]; typmods?: unknown[] };
  /** USING expression of ALTER COLUMN TYPE. */
  raw_default?: unknown;
  constraints?: { Constraint: Constraint }[];
}

export interface AlterTableCmd {
  subtype: string;
  name?: string;
  def?: { ColumnDef?: ColumnDef; Constraint?: Constraint };
}

export interface AlterTableStmt {
  relation: RangeVar;
  cmds: { AlterTableCmd: AlterTableCmd }[];
}

/** Returns the node under `key` (e.g. "AlterTableStmt") if the statement is of that type. */
export function node<T>(stmt: ParsedStatement, key: string): T | undefined {
  return (stmt.ast as Record<string, T> | undefined)?.[key];
}

export function tableKey(r: RangeVar): string {
  return `${r.schemaname ?? "public"}.${r.relname}`.toLowerCase();
}

export function qualifiedName(r: RangeVar): string {
  return r.schemaname ? `${r.schemaname}.${r.relname}` : r.relname;
}

/** Tables created by CREATE TABLE in statements[0..index), so rules can skip brand-new tables. */
export function tablesCreatedBefore(statements: ParsedStatement[], index: number): Set<string> {
  const out = new Set<string>();
  for (const s of statements.slice(0, index)) {
    const create = node<{ relation: RangeVar }>(s, "CreateStmt");
    if (create) out.add(tableKey(create.relation));
  }
  return out;
}

export interface AlterCmd {
  stmt: ParsedStatement;
  table: string;
  /** Normalised schema-qualified key, comparable across statements. */
  key: string;
  cmd: AlterTableCmd;
}

/** Every ALTER TABLE sub-command on a table that was not created earlier in the same file. */
export function alterCmdsOnExistingTables(ctx: RuleContext): AlterCmd[] {
  return ctx.statements.flatMap((stmt, i) => {
    const alter = node<AlterTableStmt>(stmt, "AlterTableStmt");
    if (!alter || tablesCreatedBefore(ctx.statements, i).has(tableKey(alter.relation))) return [];
    const table = qualifiedName(alter.relation);
    const key = tableKey(alter.relation);
    return alter.cmds.map(({ AlterTableCmd: cmd }) => ({ stmt, table, key, cmd }));
  });
}

export function finding(
  rule: Rule,
  ctx: RuleContext,
  stmt: ParsedStatement,
  message: string,
  safeAlternative?: SafeAlternative,
): Finding {
  return {
    ruleId: rule.id,
    severity: rule.severity,
    message,
    file: ctx.file,
    line: stmt.line,
    statement: stmt.sql,
    explanation: rule.explain,
    safeAlternative,
  };
}
