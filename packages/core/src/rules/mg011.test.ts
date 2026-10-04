import { describe, expect, it } from "vitest";
import { mg011 } from "./mg011.js";
import { runRule } from "./test-util.js";

describe("MG011", () => {
  it("flags SET NOT NULL on an existing column", async () => {
    const f = await runRule(mg011, "ALTER TABLE users ALTER COLUMN email SET NOT NULL;");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ ruleId: "MG011", severity: "medium" });
  });

  it("flags when the earlier CHECK is for a different column", async () => {
    const f = await runRule(
      mg011,
      "ALTER TABLE users ADD CONSTRAINT c CHECK (name IS NOT NULL) NOT VALID;\nALTER TABLE users ALTER COLUMN email SET NOT NULL;",
    );
    expect(f).toHaveLength(1);
  });

  it.each([
    [
      "preceded by CHECK (col IS NOT NULL)",
      "ALTER TABLE users ADD CONSTRAINT c CHECK (email IS NOT NULL) NOT VALID;\nALTER TABLE users VALIDATE CONSTRAINT c;\nALTER TABLE users ALTER COLUMN email SET NOT NULL;",
    ],
    ["DROP NOT NULL", "ALTER TABLE users ALTER COLUMN email DROP NOT NULL;"],
    [
      "table created in same file",
      "CREATE TABLE t (a int);\nALTER TABLE t ALTER COLUMN a SET NOT NULL;",
    ],
  ])("does not flag %s", async (_n, sql) => {
    expect(await runRule(mg011, sql)).toEqual([]);
  });
});
