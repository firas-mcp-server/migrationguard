import { describe, expect, it } from "vitest";
import { analyze } from "../analyze.js";
import { renderJson } from "./json.js";
import { renderMarkdown } from "./markdown.js";

const opts = { dialect: "postgres" } as const;

describe("renderJson", () => {
  it("emits a Report-shaped document, with errors only when present", async () => {
    const ok = JSON.parse(
      renderJson(await analyze([{ file: "a.sql", sql: "DROP TABLE t;" }], opts)),
    );
    expect(Object.keys(ok).sort()).toEqual(["findings", "summary"]);
    expect(ok.summary.high).toBe(1);
    expect(ok.findings[0]).toMatchObject({
      ruleId: "MG009",
      file: "a.sql",
      line: 1,
      severity: "high",
    });

    const bad = JSON.parse(
      renderJson(await analyze([{ file: "x.sql", sql: "ALTER TABL x" }], opts)),
    );
    expect(bad.errors).toHaveLength(1);
  });
});

describe("renderMarkdown", () => {
  it("groups by severity and shows safer alternatives for high findings only", async () => {
    const md = renderMarkdown(
      await analyze(
        [{ file: "a.sql", sql: "DROP TABLE t;\nALTER TABLE u ADD COLUMN a int;" }],
        opts,
      ),
    );
    expect(md).toContain("## High (1)");
    expect(md).toContain("## Low (1)");
    expect(md.indexOf("## High")).toBeLessThan(md.indexOf("## Low"));
    expect(md).toContain("### MG009: DROP TABLE");
    expect(md).toContain("`a.sql:1`");
    expect(md).toContain("**Safer alternative:**");
    expect(md.match(/\*\*Safer alternative:\*\*/g)).toHaveLength(1);
  });

  it("never calls a clean migration safe", async () => {
    const md = renderMarkdown(await analyze([{ file: "a.sql", sql: "SELECT 1;" }], opts));
    expect(md).toContain("No known risky patterns were found");
    expect(md).toContain("does not prove");
  });

  it("lists files that could not be analysed", async () => {
    const md = renderMarkdown(await analyze([{ file: "x.sql", sql: "ALTER TABL x" }], opts));
    expect(md).toContain("## Files that could not be analysed");
    expect(md).toContain("`x.sql`");
    expect(md).not.toContain("No known risky patterns");
  });
});
