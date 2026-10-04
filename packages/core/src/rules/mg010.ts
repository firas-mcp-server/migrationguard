import type { Rule } from "../types.js";
import { alterCmdsOnExistingTables, finding } from "./util.js";

// Known volatile built-ins. Unknown and user-defined functions are not flagged (prefer a miss).
const VOLATILE = new Set([
  "random",
  "gen_random_uuid",
  "gen_random_bytes",
  "uuid_generate_v1",
  "uuid_generate_v1mc",
  "uuid_generate_v4",
  "clock_timestamp",
  "timeofday",
  "nextval",
  "setseed",
  "txid_current",
]);
const SERIAL = new Set(["serial", "serial2", "serial4", "serial8", "smallserial", "bigserial"]);

/** Name of the first known-volatile function called anywhere inside an AST expression. */
function volatileCall(expr: unknown): string | undefined {
  if (Array.isArray(expr)) {
    for (const e of expr) {
      const hit = volatileCall(e);
      if (hit) return hit;
    }
    return undefined;
  }
  if (typeof expr !== "object" || expr === null) return undefined;
  const obj = expr as Record<string, unknown>;
  const fn = obj["FuncCall"] as { funcname?: { String?: { sval: string } }[] } | undefined;
  const name = fn?.funcname?.at(-1)?.String?.sval;
  if (name && VOLATILE.has(name)) return name;
  return volatileCall(Object.values(obj));
}

export const mg010: Rule = {
  id: "MG010",
  title: "ADD COLUMN with a volatile default",
  severity: "high",
  dialect: "postgres",
  explain:
    "On Postgres 11 and later, ADD COLUMN with a constant or stable default (for example 'x' or " +
    "now()) is a fast catalog change. A volatile default (random(), gen_random_uuid(), " +
    "nextval(), as used by serial columns) must be evaluated per row, so Postgres rewrites the " +
    "whole table under an ACCESS EXCLUSIVE lock, which may be long on a large table. Before " +
    "Postgres 11 every default rewrites. Only known built-in volatile functions are detected.",
  check(ctx) {
    return alterCmdsOnExistingTables(ctx).flatMap(({ stmt, table, cmd }) => {
      const col = cmd.def?.ColumnDef;
      if (cmd.subtype !== "AT_AddColumn" || !col) return [];
      const typeName = col.typeName?.names?.at(-1)?.String?.sval;
      const defaults = (col.constraints ?? []).filter(
        (c) => c.Constraint.contype === "CONSTR_DEFAULT",
      );
      const fn =
        typeName && SERIAL.has(typeName)
          ? "nextval (serial)"
          : volatileCall(defaults.map((c) => c.Constraint.raw_expr));
      if (!fn) return [];
      return [
        finding(
          mg010,
          ctx,
          stmt,
          `Adding column "${col.colname}" to "${table}" with a volatile default (${fn}) may rewrite a large table.`,
          {
            summary: "Add the column without a default, backfill in batches, then set the default.",
            steps: [
              {
                title: "Add the column without a default",
                sql: `ALTER TABLE ${table} ADD COLUMN ${col.colname} <type>;`,
              },
              { title: "Backfill existing rows in batches" },
              {
                title: "Set the default for new rows",
                sql: `ALTER TABLE ${table} ALTER COLUMN ${col.colname} SET DEFAULT <expression>;`,
                note: "Setting a default on an existing column does not rewrite the table.",
              },
            ],
          },
        ),
      ];
    });
  },
};
