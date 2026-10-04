import type { Finding, Rule } from "../types.js";
import {
  node,
  qualifiedName,
  tableKey,
  tablesCreatedBefore,
  type AlterTableStmt,
  type ColumnDef,
} from "./util.js";

// serial types expand to a nextval() default, so NOT NULL on them is not "without a default".
const SERIAL = new Set(["serial", "serial2", "serial4", "serial8", "smallserial", "bigserial"]);
const HAS_VALUE = new Set(["CONSTR_DEFAULT", "CONSTR_IDENTITY", "CONSTR_GENERATED"]);

function isNotNullWithoutDefault(col: ColumnDef): boolean {
  const types = col.constraints?.map((c) => c.Constraint.contype) ?? [];
  if (!types.includes("CONSTR_NOTNULL") || types.some((t) => HAS_VALUE.has(t))) return false;
  const typeName = col.typeName?.names?.at(-1)?.String?.sval;
  return !(typeName && SERIAL.has(typeName));
}

export const mg001: Rule = {
  id: "MG001",
  title: "ADD COLUMN NOT NULL without a default",
  severity: "high",
  dialect: "postgres",
  explain:
    "In Postgres (all versions), ADD COLUMN ... NOT NULL with no DEFAULT fails with a not-null " +
    "violation if the table already has any rows, because existing rows would get NULL. Teams " +
    "often work around it with a volatile or table-rewriting default, which may lock or rewrite " +
    "a large table. Adding the column nullable, backfilling in batches, then enforcing NOT NULL " +
    "avoids both. A constant DEFAULT is fast on Postgres 11 and later.",
  check(ctx) {
    const findings: Finding[] = [];
    ctx.statements.forEach((stmt, i) => {
      const alter = node<AlterTableStmt>(stmt, "AlterTableStmt");
      if (!alter || tablesCreatedBefore(ctx.statements, i).has(tableKey(alter.relation))) return;
      const table = qualifiedName(alter.relation);
      for (const { AlterTableCmd: cmd } of alter.cmds) {
        const col = cmd.def?.ColumnDef;
        if (cmd.subtype !== "AT_AddColumn" || !col || !isNotNullWithoutDefault(col)) continue;
        findings.push({
          ruleId: "MG001",
          severity: "high",
          message: `Adding NOT NULL column "${col.colname}" to "${table}" without a default may fail or force a table rewrite.`,
          file: ctx.file,
          line: stmt.line,
          statement: stmt.sql,
          explanation: this.explain,
          safeAlternative: {
            summary: "Add the column nullable, backfill in batches, then enforce NOT NULL.",
            steps: [
              {
                title: "Add the column as nullable",
                sql: `ALTER TABLE ${table} ADD COLUMN ${col.colname} <type>;`,
              },
              {
                title: "Backfill existing rows in batches",
                note: "Run outside this migration, in small batches, to avoid long transactions.",
              },
              {
                title: "Enforce NOT NULL",
                sql:
                  `ALTER TABLE ${table} ADD CONSTRAINT ${col.colname}_not_null ` +
                  `CHECK (${col.colname} IS NOT NULL) NOT VALID;\n` +
                  `ALTER TABLE ${table} VALIDATE CONSTRAINT ${col.colname}_not_null;\n` +
                  `ALTER TABLE ${table} ALTER COLUMN ${col.colname} SET NOT NULL;`,
                note: "On Postgres 12+, a validated CHECK lets SET NOT NULL skip the full table scan. Simple SET NOT NULL is fine on small tables.",
              },
            ],
          },
        });
      }
    });
    return findings;
  },
};
