import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSql } from "./parsers/sql.js";
import { rules } from "./rules/index.js";

const root = fileURLToPath(new URL("../../../fixtures/", import.meta.url));

function load(dir: "safe" | "risky") {
  return readdirSync(`${root}${dir}`)
    .filter((f) => f.endsWith(".sql"))
    .map((name) => {
      const sql = readFileSync(`${root}${dir}/${name}`, "utf8");
      const expect = /^-- expect: (.+)$/m.exec(sql)?.[1]?.trim() ?? "";
      const ids = expect === "none" ? [] : expect.split(/\s*,\s*/).sort();
      return { dir, name, sql, expectLine: expect, ids };
    });
}

async function ruleIdsFor(sql: string): Promise<string[]> {
  const statements = await parseSql(sql);
  const ctx = {
    file: "fixture.sql",
    statements,
    dialect: "postgres",
    options: { dialect: "postgres" },
  } as const;
  return rules
    .flatMap((r) => r.check(ctx))
    .map((f) => f.ruleId)
    .sort();
}

const safe = load("safe");
const risky = load("risky");

describe("fixtures", () => {
  it.each(safe)("safe/$name produces no findings", async ({ sql, expectLine }) => {
    expect(expectLine).toBe("none");
    expect(await ruleIdsFor(sql)).toEqual([]);
  });

  it.each(risky)("risky/$name triggers exactly its expected rules", async ({ sql, ids }) => {
    expect(ids.length).toBeGreaterThan(0);
    expect(await ruleIdsFor(sql)).toEqual(ids);
  });

  it.each(rules.map((r) => r.id))("%s has at least one risky and one safe fixture", (id) => {
    const prefix = id.toLowerCase();
    expect(risky.some((f) => f.name.startsWith(prefix) && f.ids.includes(id))).toBe(true);
    expect(safe.some((f) => f.name.startsWith(prefix))).toBe(true);
  });
});
