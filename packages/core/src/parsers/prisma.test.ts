import { describe, expect, it } from "vitest";
import { parsePrismaMigrations } from "./prisma.js";
import { SqlParseError } from "./sql.js";

describe("parsePrismaMigrations", () => {
  it("orders by folder name and ignores non-migration files", async () => {
    const r = await parsePrismaMigrations([
      { path: "prisma/migrations/20240201_b/migration.sql", content: "DROP TABLE b;" },
      { path: "prisma/migrations/migration_lock.toml", content: 'provider = "postgresql"' },
      { path: "prisma/migrations/20240101_a/migration.sql", content: "CREATE TABLE a (id int);" },
      { path: "prisma/schema.prisma", content: "model A {}" },
    ]);
    expect(r.map((m) => m.name)).toEqual(["20240101_a", "20240201_b"]);
    expect(r[1]?.statements[0]?.sql).toBe("DROP TABLE b");
  });

  it("returns [] when there are no migrations", async () => {
    expect(await parsePrismaMigrations([])).toEqual([]);
  });

  it("propagates SqlParseError", async () => {
    await expect(
      parsePrismaMigrations([{ path: "migrations/x/migration.sql", content: "ALTER TABL x" }]),
    ).rejects.toBeInstanceOf(SqlParseError);
  });
});
