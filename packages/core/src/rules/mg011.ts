import type { Rule } from "../types.js";
import { alterCmdsOnExistingTables, finding, strs } from "./util.js";

interface NullTest {
  NullTest?: {
    nulltesttype?: string;
    arg?: { ColumnRef?: { fields?: { String?: { sval: string } }[] } };
  };
}

/** Column named by a `CHECK (col IS NOT NULL)` expression, if that is what it is. */
function notNullCheckColumn(expr: unknown): string | undefined {
  const t = (expr as NullTest | undefined)?.NullTest;
  if (t?.nulltesttype !== "IS_NOT_NULL") return undefined;
  const fields = strs(t.arg?.ColumnRef?.fields);
  return fields.length === 1 ? fields[0] : undefined;
}

export const mg011: Rule = {
  id: "MG011",
  title: "SET NOT NULL on an existing column",
  severity: "medium",
  dialect: "postgres",
  explain:
    "In Postgres (all versions), ALTER COLUMN SET NOT NULL takes an ACCESS EXCLUSIVE lock and " +
    "scans the table to check for NULLs, which may be long on a large table. On Postgres 12 and " +
    "later the scan is skipped if a validated CHECK (column IS NOT NULL) constraint already " +
    "exists. This rule skips the statement when such a CHECK is added earlier in the same file; " +
    "a CHECK added in an earlier migration is not visible, so it may flag a safe statement.",
  check(ctx) {
    const cmds = alterCmdsOnExistingTables(ctx);
    return cmds.flatMap(({ stmt, table, key, cmd }, i) => {
      if (cmd.subtype !== "AT_SetNotNull") return [];
      const guarded = cmds.slice(0, i).some((p) => {
        const c = p.cmd.def?.Constraint;
        return (
          p.key === key &&
          p.cmd.subtype === "AT_AddConstraint" &&
          c?.contype === "CONSTR_CHECK" &&
          notNullCheckColumn(c.raw_expr) === cmd.name
        );
      });
      if (guarded) return [];
      return [
        finding(
          mg011,
          ctx,
          stmt,
          `SET NOT NULL on "${table}"."${cmd.name}" may scan a large table under an exclusive lock.`,
          {
            summary: "Prove the column has no NULLs with a CHECK constraint first.",
            steps: [
              {
                title: "Add a CHECK constraint without scanning",
                sql: `ALTER TABLE ${table} ADD CONSTRAINT ${cmd.name}_not_null CHECK (${cmd.name} IS NOT NULL) NOT VALID;`,
              },
              {
                title: "Validate it",
                sql: `ALTER TABLE ${table} VALIDATE CONSTRAINT ${cmd.name}_not_null;`,
              },
              {
                title: "Set NOT NULL (skips the scan on Postgres 12+)",
                sql: `ALTER TABLE ${table} ALTER COLUMN ${cmd.name} SET NOT NULL;`,
                note: "Optionally drop the CHECK constraint afterwards.",
              },
            ],
          },
        ),
      ];
    });
  },
};
