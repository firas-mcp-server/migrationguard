import {
  analyze,
  getRule,
  parseSql,
  rules,
  type Analysis,
  type SafeAlternative,
} from "migrationguard-core";
import { ToolError } from "./errors.js";
import { readSqlDirectory, readSqlFile } from "./paths.js";

const options = { dialect: "postgres" } as const;

function requireRule(ruleId: string) {
  const rule = getRule(ruleId);
  if (!rule) {
    throw new ToolError(
      "UNKNOWN_RULE",
      `Unknown rule "${ruleId}". Known rules: ${rules.map((r) => r.id).join(", ")}.`,
    );
  }
  return rule;
}

export async function analyzeMigration(root: string, path: string): Promise<Analysis> {
  const analysis = await analyze([await readSqlFile(root, path)], options);
  const error = analysis.errors[0];
  if (error) throw new ToolError("PARSE_ERROR", `Cannot parse ${error.file}: ${error.message}`);
  return analysis;
}

export async function analyzeDirectory(root: string, path: string): Promise<Analysis> {
  return analyze(await readSqlDirectory(root, path), options);
}

export function listRules() {
  return rules.map(({ id, title, severity }) => ({ id, title, severity }));
}

export function explainRule(ruleId: string) {
  const { id, title, severity, dialect, explain } = requireRule(ruleId);
  return { id, title, severity, dialect, explain };
}

/** Runs one rule over the statement and returns the safer alternative it proposes. */
export async function suggestSafeAlternative(
  ruleId: string,
  statement: string,
): Promise<SafeAlternative> {
  const rule = requireRule(ruleId);
  let statements;
  try {
    statements = await parseSql(statement);
  } catch (e) {
    throw new ToolError(
      "PARSE_ERROR",
      `Cannot parse statement: ${e instanceof Error ? e.message : e}`,
    );
  }
  const ctx = { file: "statement.sql", statements, dialect: options.dialect, options };
  const alternative = rule.check(ctx).find((f) => f.safeAlternative)?.safeAlternative;
  if (!alternative) {
    throw new ToolError(
      "NOT_APPLICABLE",
      `${rule.id} does not flag this statement, so there is no alternative to suggest.`,
    );
  }
  return alternative;
}
