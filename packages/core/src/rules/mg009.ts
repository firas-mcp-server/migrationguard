import type { Rule } from "../types.js";
import { finding, node, tableKey, tablesCreatedBefore } from "./util.js";

interface DropStmt {
  removeType: string;
  objects?: { List?: { items: { String?: { sval: string } }[] } }[];
}

export const mg009: Rule = {
  id: "MG009",
  title: "DROP TABLE",
  severity: "high",
  dialect: "postgres",
  explain:
    "In Postgres (all versions), DROP TABLE permanently deletes the table and its data under an " +
    "ACCESS EXCLUSIVE lock, and cannot be undone once committed. Application code that still " +
    "uses the table fails immediately. Renaming it to a tombstone name first makes the change " +
    "reversible during a retention window.",
  check(ctx) {
    return ctx.statements.flatMap((stmt, i) => {
      const drop = node<DropStmt>(stmt, "DropStmt");
      if (drop?.removeType !== "OBJECT_TABLE") return [];
      const created = tablesCreatedBefore(ctx.statements, i);
      return (drop.objects ?? []).flatMap((o) => {
        const parts = (o.List?.items ?? []).flatMap((s) => (s.String ? [s.String.sval] : []));
        const relname = parts.at(-1);
        if (!relname) return [];
        const schemaname = parts.length > 1 ? parts[parts.length - 2] : undefined;
        if (created.has(tableKey({ schemaname, relname }))) return [];
        const table = schemaname ? `${schemaname}.${relname}` : relname;
        return [
          finding(
            mg009,
            ctx,
            stmt,
            `Dropping table "${table}" permanently deletes its data and breaks code that still uses it.`,
            {
              summary: "Rename to a tombstone name first, and drop after a retention window.",
              steps: [
                {
                  title: "Stop all reads and writes of the table in application code, then deploy",
                },
                {
                  title: "Rename the table to a tombstone name",
                  sql: `ALTER TABLE ${table} RENAME TO ${relname}_deprecated;`,
                  note: "This is reversible. Keep it for a retention window.",
                },
                {
                  title: "Drop the table in a later migration, after the window",
                  sql: `DROP TABLE ${table}_deprecated;`,
                },
              ],
            },
          ),
        ];
      });
    });
  },
};
