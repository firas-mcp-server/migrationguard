import { describe, expect, it } from "vitest";
import { mg005 } from "./mg005.js";
import { runRule } from "./test-util.js";

describe("MG005", () => {
  it.each([
    ["int to bigint", "ALTER TABLE users ALTER COLUMN age TYPE bigint;"],
    ["text with USING", "ALTER TABLE users ALTER COLUMN a TYPE text USING a::text;"],
  ])("flags %s", async (_n, sql) => {
    const f = await runRule(mg005, sql);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ ruleId: "MG005", severity: "high" });
  });

  it.each([
    ["to text", "ALTER TABLE users ALTER COLUMN bio TYPE text;"],
    ["to varchar(n)", "ALTER TABLE users ALTER COLUMN name TYPE varchar(200);"],
    ["SET DEFAULT", "ALTER TABLE users ALTER COLUMN a SET DEFAULT 1;"],
    [
      "table created in same file",
      "CREATE TABLE t (a int);\nALTER TABLE t ALTER COLUMN a TYPE bigint;",
    ],
  ])("does not flag %s", async (_n, sql) => {
    expect(await runRule(mg005, sql)).toEqual([]);
  });
});
