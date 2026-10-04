import { parseSql } from "../parsers/sql.js";
import type { Finding, Rule } from "../types.js";

/** Test helper: parse `sql` and run one rule over it. */
export async function runRule(rule: Rule, sql: string): Promise<Finding[]> {
  const statements = await parseSql(sql);
  return rule.check({
    file: "m.sql",
    statements,
    dialect: "postgres",
    options: { dialect: "postgres" },
  });
}
