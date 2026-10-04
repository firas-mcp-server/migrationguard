import { describe, expect, it } from "vitest";
import { mg004 } from "./mg004.js";
import { runRule } from "./test-util.js";

describe("MG004", () => {
  it("flags RENAME COLUMN", async () => {
    const f = await runRule(mg004, "ALTER TABLE users RENAME COLUMN name TO full_name;");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ ruleId: "MG004", severity: "high" });
    expect(f[0]?.message).toContain('column "name"');
  });

  it("flags RENAME TABLE", async () => {
    const f = await runRule(mg004, "ALTER TABLE users RENAME TO people;");
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('table "users"');
  });

  it.each([
    ["RENAME CONSTRAINT", "ALTER TABLE users RENAME CONSTRAINT a TO b;"],
    ["RENAME INDEX", "ALTER INDEX i RENAME TO j;"],
    ["view column", "ALTER VIEW v RENAME COLUMN a TO b;"],
    ["table created in same file", "CREATE TABLE t (a int);\nALTER TABLE t RENAME COLUMN a TO b;"],
  ])("does not flag %s", async (_n, sql) => {
    expect(await runRule(mg004, sql)).toEqual([]);
  });
});
