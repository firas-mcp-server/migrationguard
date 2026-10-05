import { readFile, realpath, stat } from "node:fs/promises";
import { extname, relative } from "node:path";
import { ToolError } from "./errors.js";
import { resolveInside, walk } from "./paths.js";

// .sql is left out on purpose: migrations always mention the column they change.
const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".go",
  ".java",
  ".kt",
  ".php",
  ".cs",
  ".rs",
  ".prisma",
  ".graphql",
  ".yml",
  ".yaml",
  ".json",
]);
const MAX_FILE_BYTES = 1_000_000;
const MAX_REFERENCES = 200;

export interface CodeReference {
  file: string;
  line: number;
  text: string;
  /** True when the same file also mentions the table, which makes a real usage more likely. */
  mentionsTable?: boolean;
}

export interface CodeReferences {
  name: string;
  references: CodeReference[];
  filesScanned: number;
  truncated: boolean;
  note: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Plain-text search for a column (or table) name in source files under `path`. It matches whole
 * words only and cannot tell a column from an unrelated identifier with the same name, so treat
 * hits as candidates to review, and a lack of hits as "none found", not proof of no usage.
 */
export async function checkCodeReferences(
  root: string,
  path: string,
  name: string,
  table?: string,
): Promise<CodeReferences> {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name)) {
    throw new ToolError("INVALID_NAME", `"${name}" is not a plain identifier.`);
  }
  const dir = await resolveInside(root, path);
  if (!(await stat(dir)).isDirectory()) {
    throw new ToolError("NOT_A_DIRECTORY", `"${path}" is not a folder.`);
  }
  const realRoot = await realpath(root);
  const files = await walk(dir, (n) => CODE_EXTENSIONS.has(extname(n)));
  const word = new RegExp(`\\b${escape(name)}\\b`);
  const tableWord = table ? new RegExp(`\\b${escape(table)}\\b`, "i") : undefined;
  const references: CodeReference[] = [];
  let filesScanned = 0;
  let truncated = false;

  for (const file of files) {
    if ((await stat(file)).size > MAX_FILE_BYTES) continue;
    filesScanned++;
    const content = await readFile(file, "utf8");
    if (!word.test(content)) continue;
    const mentionsTable = tableWord ? tableWord.test(content) : undefined;
    for (const [i, line] of content.split("\n").entries()) {
      if (!word.test(line)) continue;
      if (references.length >= MAX_REFERENCES) {
        truncated = true;
        break;
      }
      references.push({
        file: relative(realRoot, file),
        line: i + 1,
        text: line.trim().slice(0, 200),
        ...(mentionsTable === undefined ? {} : { mentionsTable }),
      });
    }
    if (truncated) break;
  }

  return {
    name,
    references,
    filesScanned,
    truncated,
    note:
      "Text search only: matches the name as a whole word, case-sensitive, in common source files " +
      "(not .sql). It can include unrelated identifiers and miss dynamic or renamed access " +
      "(for example ORM mappings or string-built queries). Review every hit before dropping or renaming.",
  };
}
