import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";

// Created at module load so it.each tables can use it.
const base = mkdtempSync(join(tmpdir(), "mg-mcp-"));
const root = join(base, "project");
const outside = join(base, "outside");

async function connect(): Promise<Client> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await createServer(root).connect(serverT);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientT);
  return client;
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const client = await connect();
  const res = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content: { type: string; text: string }[];
  };
  const body = JSON.parse(res.content[0]?.text ?? "null");
  return { isError: res.isError === true, body };
}

beforeAll(() => {
  mkdirSync(join(root, "prisma/migrations/20240101_a"), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(root, "prisma/migrations/20240101_a/migration.sql"), "DROP TABLE t;\n");
  writeFileSync(join(root, "bad.sql"), "ALTER TABL x;\n");
  writeFileSync(join(root, "empty-dir-placeholder.txt"), "");
  mkdirSync(join(root, "no-sql"));
  writeFileSync(join(outside, "secret.sql"), "DROP TABLE secret;\n");
  symlinkSync(outside, join(root, "link-out"));
  symlinkSync(join(outside, "secret.sql"), join(root, "link-file.sql"));
  symlinkSync(outside, join(root, "prisma/migrations/escape"));
});

describe("tools", () => {
  it("lists the five tools", async () => {
    const { tools } = await (await connect()).listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "analyze_directory",
      "analyze_migration",
      "explain_rule",
      "list_rules",
      "suggest_safe_alternative",
    ]);
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
  });

  it("list_rules returns all 12 rules with id, title, severity", async () => {
    const { body, isError } = await call("list_rules");
    expect(isError).toBe(false);
    expect(body).toHaveLength(12);
    expect(body[0]).toEqual({ id: "MG001", title: expect.any(String), severity: "high" });
  });

  it("explain_rule returns the full explanation; unknown id is a structured error", async () => {
    const ok = await call("explain_rule", { ruleId: "mg002" });
    expect(ok.body).toMatchObject({ id: "MG002", dialect: "postgres" });
    expect(ok.body.explain).toContain("CONCURRENTLY");
    const bad = await call("explain_rule", { ruleId: "MG999" });
    expect(bad.isError).toBe(true);
    expect(bad.body.error.code).toBe("UNKNOWN_RULE");
  });

  it("analyze_directory reports findings for a Prisma folder and skips symlinks", async () => {
    const { body, isError } = await call("analyze_directory", { path: "prisma/migrations" });
    expect(isError).toBe(false);
    expect(body.summary).toMatchObject({ files: 1, high: 1 });
    expect(body.findings[0]).toMatchObject({ ruleId: "MG009" });
    expect(body.findings[0].file).toBe(join("prisma/migrations/20240101_a/migration.sql"));
  });

  it("analyze_migration analyses one file", async () => {
    const { body } = await call("analyze_migration", {
      path: "prisma/migrations/20240101_a/migration.sql",
    });
    expect(body.summary.high).toBe(1);
  });

  it("analyze_migration returns a PARSE_ERROR for invalid SQL instead of crashing", async () => {
    const { body, isError } = await call("analyze_migration", { path: "bad.sql" });
    expect(isError).toBe(true);
    expect(body.error.code).toBe("PARSE_ERROR");
    expect(body.error.message).toContain("bad.sql");
  });

  it("analyze_directory reports unparseable files alongside results", async () => {
    const { body, isError } = await call("analyze_directory", { path: "." });
    expect(isError).toBe(false);
    expect(body.errors.map((e: { file: string }) => e.file)).toEqual(["bad.sql"]);
  });

  it.each([
    ["file given to analyze_directory", "analyze_directory", "bad.sql", "NOT_A_DIRECTORY"],
    ["folder given to analyze_migration", "analyze_migration", "prisma", "NOT_A_FILE"],
    ["missing path", "analyze_migration", "nope.sql", "NOT_FOUND"],
    ["folder without .sql files", "analyze_directory", "no-sql", "NO_SQL_FILES"],
  ])("%s gives a structured error", async (_n, tool, path, code) => {
    const { body, isError } = await call(tool, { path });
    expect(isError).toBe(true);
    expect(body.error.code).toBe(code);
  });

  it("suggest_safe_alternative returns the rule's alternative for the statement", async () => {
    const { body } = await call("suggest_safe_alternative", {
      ruleId: "MG002",
      statement: "CREATE INDEX idx ON users (email);",
    });
    expect(body.summary).toContain("CONCURRENTLY");
    expect(body.steps[0].sql).toContain("CONCURRENTLY");
  });

  it.each([
    ["rule does not flag it", { ruleId: "MG002", statement: "SELECT 1;" }, "NOT_APPLICABLE"],
    ["invalid SQL", { ruleId: "MG002", statement: "CREATE INDX" }, "PARSE_ERROR"],
    ["unknown rule", { ruleId: "MG999", statement: "SELECT 1;" }, "UNKNOWN_RULE"],
  ])("suggest_safe_alternative: %s", async (_n, args, code) => {
    const { body, isError } = await call("suggest_safe_alternative", args);
    expect(isError).toBe(true);
    expect(body.error.code).toBe(code);
  });
});

describe("path safety", () => {
  it.each([
    ["relative traversal", "../outside/secret.sql"],
    ["absolute path outside root", join(outside, "secret.sql")],
    ["symlinked folder pointing out", "link-out/secret.sql"],
    ["symlinked file pointing out", "link-file.sql"],
  ])("rejects %s", async (_n, path) => {
    const { body, isError } = await call("analyze_migration", { path });
    expect(isError).toBe(true);
    expect(body.error.code).toBe("PATH_OUTSIDE_ROOT");
    expect(JSON.stringify(body)).not.toContain("DROP TABLE"); // file contents never leak
  });

  it("rejects a folder outside the root and ignores symlinks inside a folder", async () => {
    const out = await call("analyze_directory", { path: ".." });
    expect(out.body.error.code).toBe("PATH_OUTSIDE_ROOT");
    const inside = await call("analyze_directory", { path: "prisma/migrations" });
    expect(JSON.stringify(inside.body)).not.toContain("secret.sql");
  });
});
