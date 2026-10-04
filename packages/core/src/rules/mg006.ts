import type { Rule } from "../types.js";
import { alterCmdsOnExistingTables, finding } from "./util.js";

export const mg006: Rule = {
  id: "MG006",
  title: "ADD FOREIGN KEY without NOT VALID",
  severity: "medium",
  dialect: "postgres",
  explain:
    "In Postgres (all versions), ADD FOREIGN KEY takes a SHARE ROW EXCLUSIVE lock and scans the " +
    "table to validate existing rows, which blocks writes for the duration of the scan and may " +
    "be long on a large table. Adding the constraint NOT VALID skips the scan; VALIDATE " +
    "CONSTRAINT then checks existing rows with a weaker lock that does not block normal writes.",
  check(ctx) {
    return alterCmdsOnExistingTables(ctx).flatMap(({ stmt, table, cmd }) => {
      const c = cmd.def?.Constraint;
      if (cmd.subtype !== "AT_AddConstraint" || c?.contype !== "CONSTR_FOREIGN") return [];
      if (c.skip_validation) return [];
      return [
        finding(
          mg006,
          ctx,
          stmt,
          `Adding a foreign key to "${table}" without NOT VALID may block writes while the table is scanned.`,
          {
            summary: "Add the constraint NOT VALID, then VALIDATE it separately.",
            steps: [
              {
                title: "Add the constraint without validating existing rows",
                sql: `ALTER TABLE ${table} ADD CONSTRAINT <name> FOREIGN KEY (<column>) REFERENCES <table> (<column>) NOT VALID;`,
              },
              {
                title: "Validate in a separate statement or migration",
                sql: `ALTER TABLE ${table} VALIDATE CONSTRAINT <name>;`,
              },
            ],
          },
        ),
      ];
    });
  },
};
