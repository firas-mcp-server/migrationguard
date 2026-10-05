import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { renderJson } from "migrationguard-core";
import { z } from "zod";
import { ToolError } from "./errors.js";
import {
  analyzeDirectory,
  analyzeMigration,
  explainRule,
  listRules,
  suggestSafeAlternative,
} from "./tools.js";

const dialect = z
  .enum(["postgres"])
  .optional()
  .describe("SQL dialect. Only postgres is supported.");
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };

const text = (t: string, isError = false): Result => ({
  content: [{ type: "text", text: t }],
  ...(isError ? { isError } : {}),
});

/** Runs a tool body; every failure becomes a structured error result, never a thrown error. */
async function guard(body: () => Promise<string> | string): Promise<Result> {
  try {
    return text(await body());
  } catch (e) {
    const error =
      e instanceof ToolError
        ? { code: e.code, message: e.message }
        : { code: "INTERNAL", message: e instanceof Error ? e.message : String(e) };
    return text(JSON.stringify({ error }, null, 2), true);
  }
}

const json = (v: unknown) => JSON.stringify(v, null, 2);

/** Builds the server. `root` is the project root; no file outside it is ever read. */
export function createServer(root: string): McpServer {
  const server = new McpServer({ name: "migrationguard", version: "0.0.0" });

  server.registerTool(
    "analyze_migration",
    {
      description: "Review one Postgres migration .sql file for risky operations. Read-only.",
      inputSchema: { path: z.string().describe("Path to a .sql file inside the project"), dialect },
      annotations: readOnly,
    },
    ({ path }) => guard(async () => renderJson(await analyzeMigration(root, path))),
  );

  server.registerTool(
    "analyze_directory",
    {
      description:
        "Review every .sql file under a migrations folder (for example prisma/migrations). Read-only.",
      inputSchema: { path: z.string().describe("Path to a folder inside the project"), dialect },
      annotations: readOnly,
    },
    ({ path }) => guard(async () => renderJson(await analyzeDirectory(root, path))),
  );

  server.registerTool(
    "suggest_safe_alternative",
    {
      description: "Propose a safer multi-step alternative for a SQL statement flagged by a rule.",
      inputSchema: {
        ruleId: z.string().describe('Rule ID, for example "MG002"'),
        statement: z.string().describe("The SQL statement"),
      },
      annotations: readOnly,
    },
    ({ ruleId, statement }) =>
      guard(async () => json(await suggestSafeAlternative(ruleId, statement))),
  );

  server.registerTool(
    "list_rules",
    { description: "List every rule with its ID, title and severity.", annotations: readOnly },
    () => guard(() => json(listRules())),
  );

  server.registerTool(
    "explain_rule",
    {
      description: "Explain a rule: what it detects and the Postgres behaviour it relies on.",
      inputSchema: { ruleId: z.string().describe('Rule ID, for example "MG001"') },
      annotations: readOnly,
    },
    ({ ruleId }) => guard(() => json(explainRule(ruleId))),
  );

  return server;
}
