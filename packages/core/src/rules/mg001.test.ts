import { describe, expect, it } from "vitest";
import { parseSql } from "../parsers/sql.js";
import { mg001 } from "./mg001.js";

async function run(sql: string) {
  const statements = await parseSql(sql);
  return mg001.check({
    file: "m.sql",
    statements,
    dialect: "postgres",
    options: { dialect: "postgres" },
  });
}

describe("MG001", () => {
  it("flags NOT NULL without default on an existing table", async () => {
    const f = await run("ALTER TABLE users ADD COLUMN age integer NOT NULL;");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ ruleId: "MG001", severity: "high", line: 1 });
    expect(f[0]?.safeAlternative?.steps.length).toBeGreaterThan(1);
  });

  it("flags only the offending command in a multi-command ALTER", async () => {
    const f = await run("ALTER TABLE users ADD COLUMN a int, ADD COLUMN b int NOT NULL;");
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('"b"');
  });

  it.each([
    ["nullable column", "ALTER TABLE users ADD COLUMN a int;"],
    ["constant default", "ALTER TABLE users ADD COLUMN a text NOT NULL DEFAULT 'x';"],
    ["serial", "ALTER TABLE users ADD COLUMN a serial NOT NULL;"],
    ["identity", "ALTER TABLE users ADD COLUMN a int GENERATED ALWAYS AS IDENTITY NOT NULL;"],
    [
      "table created in same file",
      "CREATE TABLE t (id int);\nALTER TABLE t ADD COLUMN a int NOT NULL;",
    ],
    ["other ALTER", "ALTER TABLE users ALTER COLUMN a SET NOT NULL;"],
  ])("does not flag %s", async (_n, sql) => {
    expect(await run(sql)).toEqual([]);
  });
});
