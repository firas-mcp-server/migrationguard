import { describe, expect, it } from "vitest";
import type { Report } from "./index.js";

describe("types", () => {
  it("Report shape compiles", () => {
    const r: Report = { summary: { files: 0, high: 0, medium: 0, low: 0, info: 0 }, findings: [] };
    expect(r.findings).toEqual([]);
  });
});
