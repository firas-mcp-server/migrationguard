import { describe, expect, it } from "vitest";
import { mg007 } from "./mg007.js";
import { runRule } from "./test-util.js";

describe("MG007", () => {
  it.each([
    ["CHECK", "ALTER TABLE users ADD CONSTRAINT c CHECK (age > 0);"],
    ["UNIQUE", "ALTER TABLE users ADD CONSTRAINT k UNIQUE (email);"],
  ])("flags %s without NOT VALID / USING INDEX", async (_n, sql) => {
    const f = await runRule(mg007, sql);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ ruleId: "MG007", severity: "medium" });
  });

  it.each([
    ["CHECK NOT VALID", "ALTER TABLE users ADD CONSTRAINT c CHECK (age > 0) NOT VALID;"],
    ["UNIQUE USING INDEX", "ALTER TABLE users ADD CONSTRAINT k UNIQUE USING INDEX idx;"],
    ["FOREIGN KEY (MG006)", "ALTER TABLE o ADD FOREIGN KEY (a) REFERENCES u (id);"],
    ["table created in same file", "CREATE TABLE t (a int);\nALTER TABLE t ADD CHECK (a > 0);"],
  ])("does not flag %s", async (_n, sql) => {
    expect(await runRule(mg007, sql)).toEqual([]);
  });
});
