import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { SourceFile } from "migrationguard-core";
import { ToolError } from "./errors.js";

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + sep);
}

/**
 * Resolves `input` against the project root and returns its real path, rejecting anything that
 * lands outside the root, including `..` traversal and symlinks that point out of it.
 */
export async function resolveInside(root: string, input: string): Promise<string> {
  const realRoot = await realpath(root);
  const lexical = resolve(realRoot, input);
  if (!isInside(realRoot, lexical)) {
    throw new ToolError("PATH_OUTSIDE_ROOT", `Path "${input}" is outside the project root.`);
  }
  let real: string;
  try {
    real = await realpath(lexical);
  } catch {
    throw new ToolError("NOT_FOUND", `Path not found: ${input}`);
  }
  if (!isInside(realRoot, real)) {
    throw new ToolError("PATH_OUTSIDE_ROOT", `Path "${input}" resolves outside the project root.`);
  }
  return real;
}

// Symlinks are skipped while walking so a link inside the folder cannot lead out of it.
export async function walk(dir: string, accept: (name: string) => boolean): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || entry.name === "node_modules" || entry.name.startsWith(".")) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(full, accept)));
    else if (accept(entry.name)) found.push(full);
  }
  return found;
}

async function load(root: string, paths: string[]): Promise<SourceFile[]> {
  const realRoot = await realpath(root);
  return Promise.all(
    paths.map(async (p) => ({ file: relative(realRoot, p), sql: await readFile(p, "utf8") })),
  );
}

export async function readSqlFile(root: string, input: string): Promise<SourceFile> {
  const path = await resolveInside(root, input);
  if (!(await stat(path)).isFile()) {
    throw new ToolError(
      "NOT_A_FILE",
      `"${input}" is not a file. Use analyze_directory for folders.`,
    );
  }
  const [source] = await load(root, [path]);
  return source as SourceFile;
}

export async function readSqlDirectory(root: string, input: string): Promise<SourceFile[]> {
  const path = await resolveInside(root, input);
  if (!(await stat(path)).isDirectory()) {
    throw new ToolError(
      "NOT_A_DIRECTORY",
      `"${input}" is not a folder. Use analyze_migration for files.`,
    );
  }
  const paths = await walk(path, (n) => n.endsWith(".sql"));
  if (paths.length === 0) throw new ToolError("NO_SQL_FILES", `No .sql files found in "${input}".`);
  return load(root, paths);
}
