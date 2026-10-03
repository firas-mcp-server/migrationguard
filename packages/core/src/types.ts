// FROZEN shared contracts (CLAUDE.md section 5). Changes go through the architect.

export type Severity = "high" | "medium" | "low" | "info";
export type Dialect = "postgres"; // mysql added in Phase 2

export interface Finding {
  ruleId: string; // "MG001"
  severity: Severity;
  message: string;
  file: string;
  line: number;
  statement: string; // the offending SQL, trimmed
  explanation: string; // why it is risky
  safeAlternative?: SafeAlternative;
}

export interface SafeAlternative {
  summary: string;
  steps: { title: string; sql?: string; note?: string }[];
}

export interface Rule {
  id: string;
  title: string;
  severity: Severity;
  dialect: Dialect;
  explain: string;
  check(ctx: RuleContext): Finding[];
}

export interface RuleContext {
  file: string;
  statements: ParsedStatement[];
  dialect: Dialect;
  options: AnalyzeOptions;
}

export interface AnalyzeOptions {
  dialect: Dialect;
  disabledRules?: string[];
  minSeverity?: Severity;
}

export interface Report {
  summary: { files: number; high: number; medium: number; low: number; info: number };
  findings: Finding[];
}

/**
 * Output of the SQL parser, input to rules. Not defined in the spec; shape agreed here.
 * `ast` is the parser library's node for this statement, kept opaque so core types do not
 * depend on the parser choice (see parser decision issue).
 */
export interface ParsedStatement {
  /** Statement text, trimmed, without the trailing semicolon. */
  sql: string;
  /** 1-based line where the statement starts in the file. */
  line: number;
  /** True when inside an explicit BEGIN..COMMIT block (matters for MG002 and MG012). */
  inTransaction: boolean;
  /** Parser-specific AST node. */
  ast: unknown;
}
