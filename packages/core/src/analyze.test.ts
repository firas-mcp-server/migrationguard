import { describe, expect, it } from "vitest";
import { analyze } from "./analyze.js";

const opts = { dialect: "postgres" } as const;
const risky = "ALTER TABLE users DROP COLUMN a;\nCREATE INDEX i ON users (b);";

describe("analyze", () => {
  it("counts findings by severity and sorts them by file then line", async () => {
    const { report, errors } = await analyze(
      [
        { file: "b.sql", sql: "DROP TABLE t;" },
        { file: "a.sql", sql: risky },
      ],
      opts,
    );
    expect(errors).toEqual([]);
    expect(report.summary).toEqual({ files: 2, high: 3, medium: 0, low: 1, info: 0 });
    expect(report.findings.map((f) => [f.file, f.line, f.ruleId])).toEqual([
      ["a.sql", 1, "MG003"],
      ["a.sql", 1, "MG012"],
      ["a.sql", 2, "MG002"],
      ["b.sql", 1, "MG009"],
    ]);
  });

  it("honours disabledRules (case-insensitive) and minSeverity", async () => {
    const files = [{ file: "a.sql", sql: risky }];
    const off = await analyze(files, { ...opts, disabledRules: ["mg003"] });
    expect(off.report.findings.map((f) => f.ruleId)).toEqual(["MG012", "MG002"]);
    const high = await analyze(files, { ...opts, minSeverity: "high" });
    expect(high.report.findings.map((f) => f.ruleId)).toEqual(["MG003", "MG002"]);
    expect(high.report.summary.low).toBe(0);
  });

  it("reports an unparseable file in errors and keeps analysing the others", async () => {
    const { report, errors } = await analyze(
      [
        { file: "bad.sql", sql: "ALTER TABL x" },
        { file: "ok.sql", sql: "DROP TABLE t;" },
      ],
      opts,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.file).toBe("bad.sql");
    expect(report.summary.files).toBe(1);
    expect(report.findings).toHaveLength(1);
  });

  it("returns an empty report for no files", async () => {
    const { report } = await analyze([], opts);
    expect(report).toEqual({
      summary: { files: 0, high: 0, medium: 0, low: 0, info: 0 },
      findings: [],
    });
  });
});
