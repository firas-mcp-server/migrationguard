import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const command = read("./commands/migration-review.md");
const skill = read("./skills/migration-review/SKILL.md");
const manifest = JSON.parse(read("./.claude-plugin/plugin.json")) as Record<string, unknown>;

const TOOLS = [
  "analyze_migration",
  "analyze_directory",
  "suggest_safe_alternative",
  "list_rules",
  "explain_rule",
];

function frontmatter(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  expect(m, "missing frontmatter").not.toBeNull();
  return Object.fromEntries(
    (m?.[1] ?? "")
      .split("\n")
      .map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1).trim()]),
  );
}

describe("plugin manifest", () => {
  it("is named and versioned", () => {
    expect(manifest.name).toBe("migrationguard");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("skill", () => {
  it("has a name matching its folder and a description", () => {
    const fm = frontmatter(skill);
    expect(fm.name).toBe("migration-review");
    expect(fm.description).not.toBe("");
  });
});

describe("command", () => {
  it("has a description and takes an optional path", () => {
    const fm = frontmatter(command);
    expect(fm.description).not.toBe("");
    expect(command).toContain("$ARGUMENTS");
  });
  it("calls both analysis tools", () => {
    expect(command).toContain("analyze_directory");
    expect(command).toContain("analyze_migration");
  });
});

describe.each([
  ["command", command],
  ["skill", skill],
])("%s text", (_name, text) => {
  it("only references tools the MCP server provides", () => {
    const used = text.match(/\b(?:analyze|suggest|explain|list|check)_[a-z_]+\b/g) ?? [];
    for (const t of used) expect(TOOLS, t).toContain(t);
  });
  it("never claims a migration is safe", () => {
    expect(text).toContain("No known risky patterns were found");
    expect(text).toMatch(/never (say|call)/i);
    expect(text).not.toMatch(/(this|the) migration is safe/i);
  });
});
