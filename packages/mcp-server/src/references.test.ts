import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ToolError } from "./errors.js";
import { checkCodeReferences } from "./references.js";

const base = mkdtempSync(join(tmpdir(), "mg-refs-"));
const root = join(base, "project");
const outside = join(base, "outside");
mkdirSync(join(root, "src"), { recursive: true });
mkdirSync(join(root, "node_modules/x"), { recursive: true });
mkdirSync(join(root, "migrations"), { recursive: true });
mkdirSync(outside);
writeFileSync(
  join(root, "src/user.ts"),
  "const a = 1;\nconst email = user.legacy_email;\n// legacy_emails\n",
);
writeFileSync(join(root, "src/other.py"), "x = legacy_email\n");
writeFileSync(join(root, "node_modules/x/i.js"), "legacy_email\n");
writeFileSync(join(root, "migrations/1.sql"), "ALTER TABLE users DROP COLUMN legacy_email;\n");
writeFileSync(join(outside, "secret.ts"), "legacy_email\n");
symlinkSync(outside, join(root, "src/link"));

describe("checkCodeReferences", () => {
  it("finds whole-word hits with file and line, skipping .sql, node_modules and symlinks", async () => {
    const r = await checkCodeReferences(root, ".", "legacy_email");
    expect(r.references.map((x) => `${x.file}:${x.line}`).sort()).toEqual([
      "src/other.py:1",
      "src/user.ts:2",
    ]);
    expect(r.references.find((x) => x.file === "src/user.ts")?.text).toBe(
      "const email = user.legacy_email;",
    );
    expect(r.truncated).toBe(false);
  });

  it("flags files that also mention the table", async () => {
    const r = await checkCodeReferences(root, ".", "legacy_email", "user");
    const byFile = Object.fromEntries(r.references.map((x) => [x.file, x.mentionsTable]));
    expect(byFile).toEqual({ "src/user.ts": true, "src/other.py": false });
  });

  it("returns nothing, with a caveat, when there are no hits", async () => {
    const r = await checkCodeReferences(root, ".", "nope");
    expect(r.references).toEqual([]);
    expect(r.note).toContain("Text search only");
  });

  it("rejects non-identifier names, outside paths and files", async () => {
    await expect(checkCodeReferences(root, ".", "a.*")).rejects.toMatchObject({
      code: "INVALID_NAME",
    });
    await expect(checkCodeReferences(root, "..", "x")).rejects.toMatchObject({
      code: "PATH_OUTSIDE_ROOT",
    });
    await expect(checkCodeReferences(root, "src/user.ts", "x")).rejects.toBeInstanceOf(ToolError);
  });

  it("caps the number of references", async () => {
    writeFileSync(join(root, "src/big.ts"), "needle\n".repeat(250));
    const r = await checkCodeReferences(root, ".", "needle");
    expect(r.references).toHaveLength(200);
    expect(r.truncated).toBe(true);
  });
});
