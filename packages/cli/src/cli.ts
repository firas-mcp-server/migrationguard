import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  analyze,
  renderJson,
  renderMarkdown,
  SEVERITIES,
  type Severity,
  type SourceFile,
} from "migrationguard-core";

export interface Io {
  out(text: string): void;
  err(text: string): void;
}

const USAGE = `Usage: migrationguard analyze <path> [options]

Reviews Postgres migrations (a .sql file, or a folder containing .sql files such as
prisma/migrations) for risky operations.

Options:
  --format <markdown|json>   Output format (default: markdown)
  --min-severity <level>     Hide findings below high|medium|low|info
  --disable <ids>            Comma-separated rule IDs to skip, e.g. MG012,MG008
  -h, --help                 Show this help

Exit codes: 0 no high-severity findings, 1 high-severity findings, 2 usage or file errors.
`;

async function collectSqlFiles(path: string): Promise<string[]> {
  if ((await stat(path)).isFile()) return [path];
  const found: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(path, entry.name);
    if (entry.isDirectory()) found.push(...(await collectSqlFiles(full)));
    else if (entry.name.endsWith(".sql")) found.push(full);
  }
  return found;
}

/** Runs the CLI and returns the process exit code. All I/O goes through `io`. */
export async function run(argv: string[], io: Io): Promise<number> {
  let values: { format?: string; "min-severity"?: string; disable?: string; help?: boolean };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        format: { type: "string" },
        "min-severity": { type: "string" },
        disable: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (e) {
    io.err(`${e instanceof Error ? e.message : String(e)}\n\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    io.out(USAGE);
    return 0;
  }

  const [command, path, ...extra] = positionals;
  if (command !== "analyze" || !path || extra.length > 0) {
    io.err(USAGE);
    return 2;
  }
  const format = values.format ?? "markdown";
  if (format !== "markdown" && format !== "json") {
    io.err(`Unknown --format "${format}". Use markdown or json.\n`);
    return 2;
  }
  const minSeverity = values["min-severity"];
  if (minSeverity && !SEVERITIES.includes(minSeverity as Severity)) {
    io.err(`Unknown --min-severity "${minSeverity}". Use ${SEVERITIES.join(", ")}.\n`);
    return 2;
  }

  let sources: SourceFile[];
  try {
    const paths = await collectSqlFiles(resolve(path));
    if (paths.length === 0) {
      io.err(`No .sql files found in ${path}\n`);
      return 2;
    }
    sources = await Promise.all(
      paths.map(async (p) => ({
        file: relative(process.cwd(), p),
        sql: await readFile(p, "utf8"),
      })),
    );
  } catch (e) {
    io.err(`Cannot read ${path}: ${e instanceof Error ? e.message : String(e)}\n`);
    return 2;
  }

  const analysis = await analyze(sources, {
    dialect: "postgres",
    minSeverity: minSeverity as Severity | undefined,
    disabledRules: values.disable
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });
  io.out((format === "json" ? renderJson(analysis) : renderMarkdown(analysis)) + "\n");
  if (analysis.errors.length > 0) return 2;
  return analysis.report.summary.high > 0 ? 1 : 0;
}
