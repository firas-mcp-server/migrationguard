import type { Rule } from "../types.js";
import { finding, node, qualifiedName, tableKey, tablesCreatedBefore } from "./util.js";
import type { RangeVar } from "./util.js";

interface IndexStmt {
  idxname?: string;
  relation: RangeVar;
  concurrent?: boolean;
}

export const mg002: Rule = {
  id: "MG002",
  title: "CREATE INDEX without CONCURRENTLY",
  severity: "high",
  dialect: "postgres",
  explain:
    "In Postgres (all versions), CREATE INDEX takes a SHARE lock on the table for the whole " +
    "build, which blocks INSERT, UPDATE and DELETE and may be long on a large table. CREATE INDEX " +
    "CONCURRENTLY avoids blocking writes but takes longer, cannot run inside a transaction " +
    "block, and can leave an INVALID index behind if it fails.",
  check(ctx) {
    return ctx.statements.flatMap((stmt, i) => {
      const idx = node<IndexStmt>(stmt, "IndexStmt");
      if (!idx || idx.concurrent) return [];
      if (tablesCreatedBefore(ctx.statements, i).has(tableKey(idx.relation))) return [];
      const table = qualifiedName(idx.relation);
      return [
        finding(
          mg002,
          ctx,
          stmt,
          `CREATE INDEX on "${table}" without CONCURRENTLY may block writes on a large table.`,
          {
            summary: "Build the index with CREATE INDEX CONCURRENTLY, outside a transaction.",
            steps: [
              {
                title: "Create the index concurrently",
                sql: stmt.sql.replace(/^(CREATE\s+(?:UNIQUE\s+)?INDEX)\b/i, "$1 CONCURRENTLY"),
                note: "CONCURRENTLY cannot run inside a transaction block. Check that your migration tool does not wrap this statement in one.",
              },
              {
                title: "Check the result",
                note: "If the build fails it leaves an INVALID index. Drop it and retry.",
              },
            ],
          },
        ),
      ];
    });
  },
};
