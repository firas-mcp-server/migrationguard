import type { Rule } from "../types.js";
import { finding, node, tableKey, tablesCreatedBefore, type AlterTableStmt } from "./util.js";

interface VariableSetStmt {
  kind: string;
  name: string;
  args?: { A_Const?: { ival?: { ival?: number }; sval?: { sval: string } } }[];
}

/** True if the statement leaves a non-zero lock_timeout in effect. */
function setsLockTimeout(s: VariableSetStmt): boolean {
  if (s.kind !== "VAR_SET_VALUE") return false;
  const v = s.args?.[0]?.A_Const;
  if (v?.sval) return !/^0+\s*[a-z]*$/i.test(v.sval.sval.trim());
  return (v?.ival?.ival ?? 0) > 0; // a zero ival is omitted from the AST
}

export const mg012: Rule = {
  id: "MG012",
  title: "No lock_timeout set before ALTER TABLE",
  severity: "low",
  dialect: "postgres",
  explain:
    "In Postgres (all versions), ALTER TABLE needs a strong lock and waits for it indefinitely " +
    "by default. While it waits, every later query on the table queues behind it, so a blocked " +
    "ALTER TABLE can stall the application. A lock_timeout makes the statement fail fast " +
    "instead, so it can be retried. lock_timeout may also be set outside the migration (role " +
    "or connection settings), which this rule cannot see.",
  check(ctx) {
    let protectedByTimeout = false;
    for (const [i, stmt] of ctx.statements.entries()) {
      const set = node<VariableSetStmt>(stmt, "VariableSetStmt");
      if (set?.name === "lock_timeout") protectedByTimeout = setsLockTimeout(set);
      const alter = node<AlterTableStmt & { objtype?: string }>(stmt, "AlterTableStmt");
      if (!alter || alter.objtype !== "OBJECT_TABLE" || protectedByTimeout) continue;
      if (tablesCreatedBefore(ctx.statements, i).has(tableKey(alter.relation))) continue;
      return [
        finding(
          mg012,
          ctx,
          stmt,
          "No lock_timeout is set before this ALTER TABLE, so it may wait indefinitely for a lock and block other queries.",
          {
            summary: "Set a lock_timeout at the top of the migration.",
            steps: [
              {
                title: "Set a lock timeout before the first ALTER TABLE",
                sql: "SET lock_timeout = '5s';",
                note: "If it times out, retry the migration later. Choose a value that suits your traffic.",
              },
            ],
          },
        ),
      ];
    }
    return [];
  },
};
