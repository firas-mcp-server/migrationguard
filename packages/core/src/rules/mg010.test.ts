import { describe, expect, it } from "vitest";
import { mg010 } from "./mg010.js";
import { runRule } from "./test-util.js";

describe("MG010", () => {
  it.each([
    ["gen_random_uuid()", "ALTER TABLE users ADD COLUMN token uuid DEFAULT gen_random_uuid();"],
    [
      "random() nested in an expression",
      "ALTER TABLE users ADD COLUMN n int DEFAULT (random() * 10)::int;",
    ],
    ["serial", "ALTER TABLE users ADD COLUMN seq serial;"],
  ])("flags %s", async (_n, sql) => {
    const f = await runRule(mg010, sql);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ ruleId: "MG010", severity: "high" });
  });

  it.each([
    ["constant default", "ALTER TABLE users ADD COLUMN s text DEFAULT 'x';"],
    ["now()", "ALTER TABLE users ADD COLUMN c timestamptz DEFAULT now();"],
    ["current_date", "ALTER TABLE users ADD COLUMN d date DEFAULT current_date;"],
    ["no default", "ALTER TABLE users ADD COLUMN a int;"],
    ["unknown function", "ALTER TABLE users ADD COLUMN a int DEFAULT my_fn();"],
    ["SET DEFAULT on existing column", "ALTER TABLE users ALTER COLUMN a SET DEFAULT random();"],
    [
      "table created in same file",
      "CREATE TABLE t (a int);\nALTER TABLE t ADD COLUMN u uuid DEFAULT gen_random_uuid();",
    ],
  ])("does not flag %s", async (_n, sql) => {
    expect(await runRule(mg010, sql)).toEqual([]);
  });
});
