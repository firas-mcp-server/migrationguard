import type { Rule } from "../types.js";
import { alterCmdsOnExistingTables, finding } from "./util.js";

export const mg007: Rule = {
  id: "MG007",
  title: "ADD CHECK or ADD UNIQUE that scans or locks the table",
  severity: "medium",
  dialect: "postgres",
  explain:
    "In Postgres (all versions), ADD CONSTRAINT ... CHECK takes an ACCESS EXCLUSIVE lock and " +
    "scans the table to validate existing rows unless it is NOT VALID, and ADD CONSTRAINT ... " +
    "UNIQUE builds an index under a lock that blocks writes, unless it uses an existing index " +
    "(USING INDEX). Both may be long on a large table. ADD PRIMARY KEY has the same cost and " +
    "is not checked by this rule.",
  check(ctx) {
    return alterCmdsOnExistingTables(ctx).flatMap(({ stmt, table, cmd }) => {
      const c = cmd.def?.Constraint;
      if (cmd.subtype !== "AT_AddConstraint" || !c) return [];
      if (c.contype === "CONSTR_CHECK" && !c.skip_validation) {
        return [
          finding(
            mg007,
            ctx,
            stmt,
            `Adding a CHECK constraint to "${table}" without NOT VALID may scan a large table under an exclusive lock.`,
            {
              summary: "Add the constraint NOT VALID, then VALIDATE it separately.",
              steps: [
                {
                  title: "Add the constraint without scanning existing rows",
                  sql: `ALTER TABLE ${table} ADD CONSTRAINT <name> CHECK (<condition>) NOT VALID;`,
                },
                {
                  title: "Validate in a separate statement",
                  sql: `ALTER TABLE ${table} VALIDATE CONSTRAINT <name>;`,
                  note: "VALIDATE takes a weaker lock that does not block normal reads and writes.",
                },
              ],
            },
          ),
        ];
      }
      if (c.contype === "CONSTR_UNIQUE" && !c.indexname) {
        return [
          finding(
            mg007,
            ctx,
            stmt,
            `Adding a UNIQUE constraint to "${table}" may build an index under a lock that blocks writes on a large table.`,
            {
              summary: "Build a unique index concurrently, then attach it as the constraint.",
              steps: [
                {
                  title: "Build the unique index without blocking writes",
                  sql: `CREATE UNIQUE INDEX CONCURRENTLY <index_name> ON ${table} (<columns>);`,
                  note: "Cannot run inside a transaction block.",
                },
                {
                  title: "Attach the index as a constraint",
                  sql: `ALTER TABLE ${table} ADD CONSTRAINT <name> UNIQUE USING INDEX <index_name>;`,
                },
              ],
            },
          ),
        ];
      }
      return [];
    });
  },
};
