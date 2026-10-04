import { describe, expect, it } from "vitest";
import { mg008 } from "./mg008.js";
import { runRule } from "./test-util.js";

describe("MG008", () => {
  it.each([
    [
      "ALTER ADD FOREIGN KEY",
      "ALTER TABLE posts ADD CONSTRAINT fk FOREIGN KEY (author_id) REFERENCES users (id) NOT VALID;",
    ],
    [
      "inline column REFERENCES in CREATE TABLE",
      "CREATE TABLE posts (id int PRIMARY KEY, author_id int REFERENCES users (id));",
    ],
    [
      "ADD COLUMN ... REFERENCES",
      "ALTER TABLE posts ADD COLUMN author_id int REFERENCES users (id);",
    ],
    [
      "index that only covers a later column",
      "CREATE INDEX i ON posts (title, author_id);\nALTER TABLE posts ADD FOREIGN KEY (author_id) REFERENCES users (id);",
    ],
    [
      "partial index",
      "CREATE INDEX i ON posts (author_id) WHERE author_id > 0;\nALTER TABLE posts ADD FOREIGN KEY (author_id) REFERENCES users (id);",
    ],
  ])("flags %s", async (_n, sql) => {
    const f = await runRule(mg008, sql);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ ruleId: "MG008", severity: "medium" });
  });

  it.each([
    [
      "index before the FK",
      "CREATE INDEX CONCURRENTLY i ON posts (author_id);\nALTER TABLE posts ADD FOREIGN KEY (author_id) REFERENCES users (id);",
    ],
    [
      "index after the FK",
      "ALTER TABLE posts ADD FOREIGN KEY (author_id) REFERENCES users (id);\nCREATE INDEX i ON posts (author_id);",
    ],
    [
      "composite index with FK as leading columns",
      "CREATE INDEX i ON posts (b, a, c);\nALTER TABLE posts ADD FOREIGN KEY (a, b) REFERENCES u (a, b);",
    ],
    ["FK column is the primary key", "CREATE TABLE t (id int PRIMARY KEY REFERENCES u (id));"],
    [
      "table-level UNIQUE covers the FK",
      "CREATE TABLE t (a int, b int, UNIQUE (a, b), FOREIGN KEY (a) REFERENCES u (id));",
    ],
    ["no foreign keys", "CREATE TABLE t (a int);"],
  ])("does not flag %s", async (_n, sql) => {
    expect(await runRule(mg008, sql)).toEqual([]);
  });
});
