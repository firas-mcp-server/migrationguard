import { describe, expect, it } from "vitest";
import { mg002 } from "./mg002.js";
import { runRule } from "./test-util.js";

describe("MG002", () => {
  it("flags CREATE INDEX without CONCURRENTLY and suggests the concurrent form", async () => {
    const f = await runRule(mg002, "CREATE UNIQUE INDEX idx ON users (email);");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ ruleId: "MG002", severity: "high" });
    expect(f[0]?.safeAlternative?.steps[0]?.sql).toBe(
      "CREATE UNIQUE INDEX CONCURRENTLY idx ON users (email)",
    );
  });

  it.each([
    ["CONCURRENTLY", "CREATE INDEX CONCURRENTLY idx ON users (email);"],
    ["new table in same file", "CREATE TABLE t (a int);\nCREATE INDEX i ON t (a);"],
  ])("does not flag %s", async (_n, sql) => {
    expect(await runRule(mg002, sql)).toEqual([]);
  });
});
