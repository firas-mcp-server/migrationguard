import { describe, expect, it } from "vitest";
import { mg003 } from "./mg003.js";
import { runRule } from "./test-util.js";

describe("MG003", () => {
  it("flags DROP COLUMN, including IF EXISTS", async () => {
    const f = await runRule(mg003, "ALTER TABLE users DROP COLUMN IF EXISTS legacy;");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ ruleId: "MG003", severity: "high", line: 1 });
    expect(f[0]?.message).toContain('"legacy"');
  });

  it.each([
    ["DROP CONSTRAINT", "ALTER TABLE users DROP CONSTRAINT c;"],
    ["DROP NOT NULL", "ALTER TABLE users ALTER COLUMN a DROP NOT NULL;"],
    ["table created in same file", "CREATE TABLE t (a int, b int);\nALTER TABLE t DROP COLUMN b;"],
  ])("does not flag %s", async (_n, sql) => {
    expect(await runRule(mg003, sql)).toEqual([]);
  });
});
