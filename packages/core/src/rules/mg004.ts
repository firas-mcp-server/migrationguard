import type { Rule } from "../types.js";
import { finding, node, qualifiedName, tableKey, tablesCreatedBefore } from "./util.js";
import type { RangeVar } from "./util.js";

interface RenameStmt {
  renameType: string;
  relationType?: string;
  relation?: RangeVar;
  subname?: string;
  newname: string;
}

export const mg004: Rule = {
  id: "MG004",
  title: "RENAME COLUMN or RENAME TABLE",
  severity: "high",
  dialect: "postgres",
  explain:
    "In Postgres (all versions), renaming a column or table is a fast catalog change under a " +
    "brief ACCESS EXCLUSIVE lock, but the old name stops working immediately. Application code " +
    "that is still running (during a rolling deploy, for example) and code that has not been " +
    "updated will fail.",
  check(ctx) {
    return ctx.statements.flatMap((stmt, i) => {
      const r = node<RenameStmt>(stmt, "RenameStmt");
      if (!r?.relation) return [];
      const isColumn = r.renameType === "OBJECT_COLUMN" && r.relationType === "OBJECT_TABLE";
      const isTable = r.renameType === "OBJECT_TABLE";
      if (!isColumn && !isTable) return [];
      if (tablesCreatedBefore(ctx.statements, i).has(tableKey(r.relation))) return [];
      const table = qualifiedName(r.relation);
      const what = isColumn ? `column "${r.subname}" of "${table}"` : `table "${table}"`;
      return [
        finding(
          mg004,
          ctx,
          stmt,
          `Renaming ${what} to "${r.newname}" breaks code that still uses the old name.`,
          {
            summary: "Use expand and contract instead of renaming in place.",
            steps: [
              { title: `Add the new ${isColumn ? "column" : "table"} alongside the old one` },
              { title: "Dual-write to both and backfill existing data in batches" },
              { title: "Switch reads to the new name and deploy" },
              { title: "Drop the old one in a later migration" },
            ],
          },
        ),
      ];
    });
  },
};
