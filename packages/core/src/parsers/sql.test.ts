import { describe, expect, it } from "vitest";
import { parseSql, SqlParseError } from "./sql.js";

describe("parseSql", () => {
  it("returns statements with trimmed text and start lines, skipping comments", async () => {
    const sql = `-- header\nSET lock_timeout = '5s';\n\n/* note */\nALTER TABLE users ADD COLUMN a int;\n`;
    const r = await parseSql(sql);
    expect(r.map((s) => [s.sql, s.line])).toEqual([
      ["SET lock_timeout = '5s'", 2],
      ["ALTER TABLE users ADD COLUMN a int", 5],
    ]);
  });

  it("handles dollar-quoted bodies containing semicolons", async () => {
    const r = await parseSql("DO $$ BEGIN PERFORM 1; PERFORM 2; END $$;\nSELECT 1;");
    expect(r).toHaveLength(2);
    expect(r[1]?.line).toBe(2);
  });

  it("tracks explicit transaction blocks", async () => {
    const r = await parseSql("SELECT 1;\nBEGIN;\nSELECT 2;\nCOMMIT;\nSELECT 3;");
    expect(r.map((s) => s.inTransaction)).toEqual([false, true, true, true, false]);
  });

  it("exposes the AST", async () => {
    const [s] = await parseSql("DROP TABLE t;");
    expect(s?.ast).toHaveProperty("DropStmt");
  });

  it("returns [] for empty input", async () => {
    expect(await parseSql("  \n-- only a comment\n")).toEqual([]);
  });

  it("throws SqlParseError on invalid SQL", async () => {
    await expect(parseSql("ALTER TABL x")).rejects.toBeInstanceOf(SqlParseError);
  });
});

describe("parseSql edge cases", () => {
  it("reports the start line of multi-line statements and handles CRLF", async () => {
    const r = await parseSql("SELECT 1;\r\n\r\nALTER TABLE t\r\n  ADD COLUMN a int;\r\n");
    expect(r.map((s) => s.line)).toEqual([1, 3]);
  });

  it("clears the transaction flag on ROLLBACK", async () => {
    const r = await parseSql("START TRANSACTION;\nSELECT 1;\nROLLBACK;\nSELECT 2;");
    expect(r.map((s) => s.inTransaction)).toEqual([true, true, true, false]);
  });
});
