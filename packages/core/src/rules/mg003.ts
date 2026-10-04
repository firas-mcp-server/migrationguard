import type { Rule } from "../types.js";
import { alterCmdsOnExistingTables, finding } from "./util.js";

export const mg003: Rule = {
  id: "MG003",
  title: "DROP COLUMN",
  severity: "high",
  dialect: "postgres",
  explain:
    "In Postgres (all versions), DROP COLUMN takes a brief ACCESS EXCLUSIVE lock (it can queue " +
    "behind long transactions and block other queries while waiting) and does not rewrite the " +
    "table. The main risks are permanent data loss and running application code that still " +
    "reads or writes the column, which starts failing as soon as the migration runs.",
  check(ctx) {
    return alterCmdsOnExistingTables(ctx)
      .filter(({ cmd }) => cmd.subtype === "AT_DropColumn")
      .map(({ stmt, table, cmd }) =>
        finding(
          mg003,
          ctx,
          stmt,
          `Dropping column "${cmd.name}" from "${table}" loses its data and breaks code that still uses it.`,
          {
            summary: "Stop using the column in code, deploy, then drop it in a later migration.",
            steps: [
              { title: "Remove all reads and writes of the column from application code" },
              { title: "Deploy and confirm nothing uses the column" },
              {
                title: "Drop the column in a later migration",
                sql: `ALTER TABLE ${table} DROP COLUMN ${cmd.name};`,
                note: "Take a backup first if the data may be needed again.",
              },
            ],
          },
        ),
      );
  },
};
