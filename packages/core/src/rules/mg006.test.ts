import { describe, expect, it } from "vitest";
import { mg006 } from "./mg006.js";
import { runRule } from "./test-util.js";

describe("MG006", () => {
  it("flags ADD FOREIGN KEY without NOT VALID", async () => {
    const f = await runRule(
      mg006,
      "ALTER TABLE orders ADD FOREIGN KEY (user_id) REFERENCES users (id);",
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ ruleId: "MG006", severity: "medium" });
  });

  it.each([
    [
      "NOT VALID",
      "ALTER TABLE orders ADD CONSTRAINT fk FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;",
    ],
    ["VALIDATE", "ALTER TABLE orders VALIDATE CONSTRAINT fk;"],
    ["CHECK constraint (MG007)", "ALTER TABLE orders ADD CONSTRAINT c CHECK (a > 0);"],
    [
      "table created in same file",
      "CREATE TABLE t (a int);\nALTER TABLE t ADD FOREIGN KEY (a) REFERENCES u (id);",
    ],
  ])("does not flag %s", async (_n, sql) => {
    expect(await runRule(mg006, sql)).toEqual([]);
  });
});
