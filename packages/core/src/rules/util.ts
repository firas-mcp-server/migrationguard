import type { ParsedStatement } from "../types.js";

// Minimal views over the libpg-query AST. Only the fields rules read are typed;
// the AST itself stays `unknown` in ParsedStatement so core does not depend on the parser.
export interface RangeVar {
  schemaname?: string;
  relname: string;
}

export interface Constraint {
  contype: string;
}

export interface ColumnDef {
  colname: string;
  typeName?: { names?: { String?: { sval: string } }[] };
  constraints?: { Constraint: Constraint }[];
}

export interface AlterTableCmd {
  subtype: string;
  def?: { ColumnDef?: ColumnDef };
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
