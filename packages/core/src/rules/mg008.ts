import type { Finding, ParsedStatement, Rule } from "../types.js";
import {
  finding,
  node,
  qualifiedName,
  strs,
  tableKey,
  type AlterTableStmt,
  type ColumnDef,
  type Constraint,
  type RangeVar,
} from "./util.js";

interface Fk {
  stmt: ParsedStatement;
  table: string;
  key: string;
  cols: string[];
}
interface Idx {
  key: string;
  cols: string[];
}

interface CreateStmt {
  relation: RangeVar;
  tableElts?: { ColumnDef?: ColumnDef; Constraint?: Constraint }[];
}
interface IndexStmt {
  relation: RangeVar;
  whereClause?: unknown;
  indexParams: { IndexElem: { name?: string } }[];
}

// Columns constrained by a constraint, given the column it was declared on (if column-level).
function fkCols(c: Constraint, column?: string): string[] {
  return column ? [column] : strs(c.fk_attrs);
}
function keyCols(c: Constraint, column?: string): string[] {
  return column ? [column] : strs(c.keys);
}

export const mg008: Rule = {
  id: "MG008",
  title: "Foreign key column without a supporting index",
  severity: "medium",
  dialect: "postgres",
  explain:
    "In Postgres (all versions), a foreign key does not create an index on the referencing " +
    "columns. Without one, deleting or updating a row in the referenced table scans the " +
    "referencing table, which may be slow on a large table. This rule only sees the one file " +
    "it analyses: an index created in another migration is not visible, so it may flag a " +
    "foreign key whose index exists elsewhere.",
  check(ctx) {
    const fks: Fk[] = [];
    const idxs: Idx[] = [];

    const addColumn = (stmt: ParsedStatement, relation: RangeVar, col: ColumnDef) => {
      for (const { Constraint: c } of col.constraints ?? []) {
        if (c.contype === "CONSTR_FOREIGN") {
          fks.push({
            stmt,
            table: qualifiedName(relation),
            key: tableKey(relation),
            cols: [col.colname],
          });
        } else if (c.contype === "CONSTR_PRIMARY" || c.contype === "CONSTR_UNIQUE") {
          idxs.push({ key: tableKey(relation), cols: [col.colname] });
        }
      }
    };
    const addConstraint = (stmt: ParsedStatement, relation: RangeVar, c: Constraint) => {
      if (c.contype === "CONSTR_FOREIGN") {
        fks.push({
          stmt,
          table: qualifiedName(relation),
          key: tableKey(relation),
          cols: fkCols(c),
        });
      } else if (c.contype === "CONSTR_PRIMARY" || c.contype === "CONSTR_UNIQUE") {
        idxs.push({ key: tableKey(relation), cols: keyCols(c) });
      }
    };

    for (const stmt of ctx.statements) {
      const create = node<CreateStmt>(stmt, "CreateStmt");
      if (create) {
        for (const elt of create.tableElts ?? []) {
          if (elt.ColumnDef) addColumn(stmt, create.relation, elt.ColumnDef);
          if (elt.Constraint) addConstraint(stmt, create.relation, elt.Constraint);
        }
      }
      const alter = node<AlterTableStmt>(stmt, "AlterTableStmt");
      if (alter) {
        for (const { AlterTableCmd: cmd } of alter.cmds) {
          if (cmd.subtype === "AT_AddColumn" && cmd.def?.ColumnDef) {
            addColumn(stmt, alter.relation, cmd.def.ColumnDef);
          } else if (cmd.subtype === "AT_AddConstraint" && cmd.def?.Constraint) {
            addConstraint(stmt, alter.relation, cmd.def.Constraint);
          }
        }
      }
      const index = node<IndexStmt>(stmt, "IndexStmt");
      if (index && !index.whereClause) {
        const cols: string[] = [];
        for (const { IndexElem: e } of index.indexParams) {
          if (!e.name) break; // expression: later columns cannot serve a plain FK lookup
          cols.push(e.name);
        }
        idxs.push({ key: tableKey(index.relation), cols });
      }
    }

    // The FK columns must be the leading columns of some index, in any order.
    const supported = (fk: Fk) =>
      idxs.some(
        (i) =>
          i.key === fk.key &&
          i.cols.length >= fk.cols.length &&
          [...i.cols.slice(0, fk.cols.length)].sort().join() === [...fk.cols].sort().join(),
      );

    const out: Finding[] = [];
    for (const fk of fks) {
      if (fk.cols.length === 0 || supported(fk)) continue;
      const cols = fk.cols.join(", ");
      out.push(
        finding(
          mg008,
          ctx,
          fk.stmt,
          `Foreign key on "${fk.table}" (${cols}) has no index on those columns in this file.`,
          {
            summary: "Add an index on the foreign key columns, concurrently.",
            steps: [
              {
                title: "Create the supporting index",
                sql: `CREATE INDEX CONCURRENTLY ON ${fk.table} (${cols});`,
                note: "Cannot run inside a transaction block. Skip if an index already exists from an earlier migration.",
              },
            ],
          },
        ),
      );
    }
    return out;
  },
};
