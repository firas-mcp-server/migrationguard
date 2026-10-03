import type { ParsedStatement } from "../types.js";
import { parseSql } from "./sql.js";

export interface MigrationFile {
  path: string;
  content: string;
}

export interface ParsedMigration {
  /** Prisma migration folder name, e.g. "20240101000000_init". */
  name: string;
  file: string;
  statements: ParsedStatement[];
}

const MIGRATION_SQL = /(?:^|[\\/])migrations[\\/]([^\\/]+)[\\/]migration\.sql$/;

/**
 * Picks `prisma/migrations/<name>/migration.sql` out of the given files (others, such as
 * migration_lock.toml, are ignored) and parses them in folder-name order, which is the order
 * Prisma applies them. Pure: callers read the files. Throws SqlParseError on invalid SQL.
 */
export async function parsePrismaMigrations(files: MigrationFile[]): Promise<ParsedMigration[]> {
  const found = files.flatMap((f) => {
    const name = MIGRATION_SQL.exec(f.path)?.[1];
    return name ? [{ name, file: f.path, content: f.content }] : [];
  });
  found.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return Promise.all(
    found.map(async ({ name, file, content }) => ({
      name,
      file,
      statements: await parseSql(content),
    })),
  );
}
