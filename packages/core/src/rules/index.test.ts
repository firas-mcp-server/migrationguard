import { describe, expect, it } from "vitest";
import { getRule, rules } from "./index.js";

describe("rule registry", () => {
  it("has unique, well-formed rules", () => {
    const ids = rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of rules) {
      expect(r.id).toMatch(/^MG\d{3}$/);
      expect(r.explain.length).toBeGreaterThan(0);
    }
  });

  it("looks rules up by id, case-insensitively", () => {
    expect(getRule("mg001")?.id).toBe("MG001");
    expect(getRule("MG999")).toBeUndefined();
  });
});
