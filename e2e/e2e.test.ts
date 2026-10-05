import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { beforeAll, describe, expect, it } from "vitest";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const cli = at("../packages/cli/dist/index.js");
const mcp = at("../packages/mcp-server/dist/index.js");
const project = at("../fixtures/prisma-project");

// The sample Prisma project: MG001 + MG002 in add_email, MG003 in drop_legacy.
const EXPECTED = ["MG001", "MG002", "MG003"];

beforeAll(() => {
  if (!existsSync(cli) || !existsSync(mcp)) throw new Error("Run `pnpm build` before test:e2e");
});

function runCli(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: project, encoding: "utf8" });
}

describe("CLI on a sample Prisma project", () => {
  it("prints a Markdown report and exits 1 on high findings", () => {
    const r = runCli("analyze", "prisma/migrations");
    expect(r.status).toBe(1);
    for (const id of EXPECTED) expect(r.stdout).toContain(id);
    expect(r.stdout).not.toMatch(/is safe/i);
  });

  it("prints a Report-shaped JSON document", () => {
    const r = runCli("analyze", "prisma/migrations", "--format", "json");
    const report = JSON.parse(r.stdout);
    expect(report.summary).toEqual({ files: 3, high: 3, medium: 0, low: 0, info: 0 });
    expect(report.findings.map((f: { ruleId: string }) => f.ruleId)).toEqual(EXPECTED);
  });

  it("exits 0 when findings are filtered out", () => {
    expect(runCli("analyze", "prisma/migrations", "--disable", EXPECTED.join(",")).status).toBe(0);
  });

  it("exits 2 for a missing path", () => {
    expect(runCli("analyze", "nope").status).toBe(2);
  });
});

describe("MCP server over stdio", () => {
  async function withClient<T>(fn: (c: Client) => Promise<T>, root = project): Promise<T> {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [mcp],
      env: { ...(process.env as Record<string, string>), MIGRATIONGUARD_ROOT: root },
    });
    const client = new Client({ name: "e2e", version: "0.0.0" });
    await client.connect(transport);
    try {
      return await fn(client);
    } finally {
      await client.close();
    }
  }
  const body = (res: unknown) =>
    JSON.parse((res as { content: { text: string }[] }).content[0]?.text ?? "null");

  it("lists the five tools", async () => {
    const names = await withClient(async (c) => (await c.listTools()).tools.map((t) => t.name));
    expect(names.sort()).toEqual(
      [
        "analyze_directory",
        "analyze_migration",
        "explain_rule",
        "list_rules",
        "suggest_safe_alternative",
      ].sort(),
    );
  });

  it("list_rules returns all twelve rules", async () => {
    const rules = body(await withClient((c) => c.callTool({ name: "list_rules", arguments: {} })));
    expect(rules).toHaveLength(12);
  });

  it("analyze_directory finds the expected rules in the Prisma project", async () => {
    const res = body(
      await withClient((c) =>
        c.callTool({ name: "analyze_directory", arguments: { path: "prisma/migrations" } }),
      ),
    );
    expect(res.findings.map((f: { ruleId: string }) => f.ruleId)).toEqual(EXPECTED);
  });

  it("analyze_migration works on one file", async () => {
    const res = body(
      await withClient((c) =>
        c.callTool({
          name: "analyze_migration",
          arguments: { path: "prisma/migrations/20240301000000_drop_legacy/migration.sql" },
        }),
      ),
    );
    expect(res.findings.map((f: { ruleId: string }) => f.ruleId)).toEqual(["MG003"]);
  });

  it("rejects paths outside the root without crashing", async () => {
    await withClient(async (c) => {
      const bad = await c.callTool({ name: "analyze_directory", arguments: { path: ".." } });
      expect(bad.isError).toBe(true);
      // Server is still alive afterwards.
      expect(body(await c.callTool({ name: "list_rules", arguments: {} }))).toHaveLength(12);
    });
  });
});
