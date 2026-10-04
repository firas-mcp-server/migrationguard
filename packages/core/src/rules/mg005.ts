import type { Rule } from "../types.js";
import { alterCmdsOnExistingTables, finding } from "./util.js";

export const mg005: Rule = {
  id: "MG005",
  title: "ALTER COLUMN TYPE that may rewrite the table",
  severity: "high",
  dialect: "postgres",
  explain:
    "In Postgres (all versions), ALTER COLUMN TYPE takes an ACCESS EXCLUSIVE lock and rewrites " +
    "the whole table and its indexes, unless the old type is binary-coercible to the new one " +
    "(for example varchar to text, or a longer varchar limit on Postgres 9.2+). The old type " +
    "is not visible from the migration alone, so this rule skips changes to text or varchar " +
    "without a USING clause and flags the rest as a possible rewrite. It may miss rewriting " +
    "changes to those types (for example int to text) and may flag a rare no-rewrite change.",
  check(ctx) {
    return alterCmdsOnExistingTables(ctx).flatMap(({ stmt, table, cmd }) => {
      const col = cmd.def?.ColumnDef;
      if (cmd.subtype !== "AT_AlterColumnType" || !col) return [];
      const typeName = col.typeName?.names?.at(-1)?.String?.sval;
      if (!col.raw_default && (typeName === "text" || typeName === "varchar")) return [];
      return [
        finding(
          mg005,
          ctx,
          stmt,
          `Changing the type of "${table}"."${cmd.name}" may rewrite a large table under an exclusive lock.`,
          {
            summary: "Add a new column, backfill, then swap.",
            steps: [
              {
                title: "Add a new column with the target type",
                sql: `ALTER TABLE ${table} ADD COLUMN ${cmd.name}_new ${typeName ?? "<type>"};`,
              },
              { title: "Dual-write to both columns and backfill existing rows in batches" },
              { title: "Switch reads to the new column and deploy" },
              { title: "Drop the old column in a later migration and rename if needed" },
            ],
          },
        ),
      ];
    });
  },
};
