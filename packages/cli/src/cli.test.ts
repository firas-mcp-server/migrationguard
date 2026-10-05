import { mkdtempSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { run } from "./cli.js";

async function cli(...argv: string[]) {
  let out = "";
  let err = "";
  const code = await run(argv, { out: (s) => (out += s), err: (s) => (err += s) });
  return { code, out, err };
}

// Created at module load: it.each tables below are built before beforeAll runs.
const dir = mkdtempSync(join(tmpdir(), "mg-cli-"));
beforeAll(async () => {
  await mkdir(join(dir, "prisma/migrations/20240101_a"), { recursive: true });
  await mkdir(join(dir, "node_modules/x"), { recursive: true });
  await writeFile(join(dir, "prisma/migrations/20240101_a/migration.sql"), "DROP TABLE t;\n");
  await writeFile(join(dir, "prisma/migrations/migration_lock.toml"), 'provider = "postgresql"');
  await writeFile(join(dir, "node_modules/x/ignored.sql"), "DROP TABLE ignored;");
  await writeFile(join(dir, "clean.sql"), "SELECT 1;\n");
  await writeFile(join(dir, "bad.sql"), "ALTER TABL x;\n");
});

describe("migrationguard analyze", () => {
  it("prints a Markdown report by default and exits 1 on high findings", async () => {
    const r = await cli("analyze", join(dir, "prisma"));
    expect(r.code).toBe(1);
    expect(r.out).toContain("# MigrationGuard report");
    expect(r.out).toContain("MG009");
    expect(r.out).not.toContain("ignored");
  });

  it("--format json prints valid Report JSON", async () => {
    const r = await cli("analyze", join(dir, "prisma"), "--format", "json");
    const report = JSON.parse(r.out);
    expect(report.summary).toMatchObject({ files: 1, high: 1 });
    expect(report.findings[0].ruleId).toBe("MG009");
  });

  it("exits 0 for a clean file and honours --disable and --min-severity", async () => {
    expect((await cli("analyze", join(dir, "clean.sql"))).code).toBe(0);
    const off = await cli("analyze", join(dir, "prisma"), "--disable", "mg009", "--format", "json");
    expect(off.code).toBe(0);
    expect(JSON.parse(off.out).findings).toEqual([]);
    const min = await cli(
      "analyze",
      join(dir, "prisma"),
      "--min-severity",
      "high",
      "--format",
      "json",
    );
    expect(JSON.parse(min.out).summary.low).toBe(0);
  });

  it("exits 2 and names the file when SQL cannot be parsed", async () => {
    const r = await cli("analyze", join(dir, "bad.sql"));
    expect(r.code).toBe(2);
    expect(r.out).toContain("could not be analysed");
    expect(r.out).toContain("bad.sql");
  });

  it.each([
    ["missing path", ["analyze", join(dir, "nope")]],
    ["no command", []],
    ["bad format", ["analyze", join(dir, "clean.sql"), "--format", "xml"]],
    ["bad severity", ["analyze", join(dir, "clean.sql"), "--min-severity", "huge"]],
    ["unknown flag", ["analyze", join(dir, "clean.sql"), "--nope"]],
  ])("exits 2 with a message for %s", async (_n, args) => {
    const r = await cli(...args);
    expect(r.code).toBe(2);
    expect(r.err.length).toBeGreaterThan(0);
  });

  it("prints usage for --help", async () => {
    const r = await cli("--help");
    expect(r.code).toBe(0);
    expect(r.out).toContain("Usage: migrationguard analyze");
  });
});
