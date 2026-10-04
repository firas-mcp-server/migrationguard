import { describe, expect, it } from "vitest";
import { mg012 } from "./mg012.js";
import { runRule } from "./test-util.js";

describe("MG012", () => {
  it("flags the first ALTER TABLE only, once per file", async () => {
    const f = await runRule(
      mg012,
      "ALTER TABLE a ADD COLUMN x int;\nALTER TABLE b ADD COLUMN y int;",
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ ruleId: "MG012", severity: "low", line: 1 });
  });

  it("flags when lock_timeout is set to zero or reset before the ALTER", async () => {
    expect(
      await runRule(mg012, "SET lock_timeout = 0;\nALTER TABLE a ADD COLUMN x int;"),
    ).toHaveLength(1);
    expect(
      await runRule(mg012, "SET lock_timeout = '0';\nALTER TABLE a ADD COLUMN x int;"),
    ).toHaveLength(1);
    expect(
      await runRule(
        mg012,
        "SET lock_timeout = '5s';\nRESET lock_timeout;\nALTER TABLE a ADD COLUMN x int;",
      ),
    ).toHaveLength(1);
  });

  it("flags when lock_timeout is only set after the ALTER", async () => {
    expect(
      await runRule(mg012, "ALTER TABLE a ADD COLUMN x int;\nSET lock_timeout = '5s';"),
    ).toHaveLength(1);
  });

  it.each([
    ["string value", "SET lock_timeout = '5s';\nALTER TABLE a ADD COLUMN x int;"],
    ["numeric value", "SET LOCAL lock_timeout TO 1000;\nALTER TABLE a ADD COLUMN x int;"],
    ["no ALTER TABLE", "CREATE INDEX CONCURRENTLY i ON a (x);"],
    ["ALTER INDEX", "ALTER INDEX i RENAME TO j;"],
    ["table created in same file", "CREATE TABLE t (a int);\nALTER TABLE t ADD COLUMN b int;"],
  ])("does not flag %s", async (_n, sql) => {
    expect(await runRule(mg012, sql)).toEqual([]);
  });
});
