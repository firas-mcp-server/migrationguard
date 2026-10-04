import { describe, expect, it } from "vitest";
import { mg009 } from "./mg009.js";
import { runRule } from "./test-util.js";

describe("MG009", () => {
  it("flags each dropped table, including IF EXISTS and schema-qualified names", async () => {
    const f = await runRule(mg009, "DROP TABLE IF EXISTS public.old_a, old_b;");
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ ruleId: "MG009", severity: "high" });
    expect(f[0]?.message).toContain('"public.old_a"');
  });

  it.each([
    ["DROP INDEX", "DROP INDEX i;"],
    ["DROP VIEW", "DROP VIEW v;"],
    ["table created in same file", "CREATE TABLE tmp (a int);\nDROP TABLE tmp;"],
  ])("does not flag %s", async (_n, sql) => {
    expect(await runRule(mg009, sql)).toEqual([]);
  });
});
