import { parseSql } from "./parsers/sql.js";
import { rules } from "./rules/index.js";
import type { AnalyzeOptions, Finding, Report, Severity } from "./types.js";

export interface SourceFile {
  file: string;
  sql: string;
}

/** A file that could not be analysed (for example, invalid SQL). */
export interface FileError {
  file: string;
  message: string;
}

export interface Analysis {
  report: Report;
  errors: FileError[];
}

export const SEVERITIES: Severity[] = ["high", "medium", "low", "info"];

/** Runs the enabled rules over each file. A file that fails to parse is reported in `errors`. */
export async function analyze(files: SourceFile[], options: AnalyzeOptions): Promise<Analysis> {
  const disabled = new Set((options.disabledRules ?? []).map((id) => id.toUpperCase()));
  const maxRank = options.minSeverity ? SEVERITIES.indexOf(options.minSeverity) : SEVERITIES.length;
  const active = rules.filter((r) => r.dialect === options.dialect && !disabled.has(r.id));

  const findings: Finding[] = [];
  const errors: FileError[] = [];
  let analysed = 0;
  for (const { file, sql } of [...files].sort((a, b) => a.file.localeCompare(b.file))) {
    try {
      const statements = await parseSql(sql);
      const ctx = { file, statements, dialect: options.dialect, options };
      for (const rule of active) findings.push(...rule.check(ctx));
      analysed++;
    } catch (e) {
      errors.push({ file, message: e instanceof Error ? e.message : String(e) });
    }
  }

  const kept = findings
    .filter((f) => SEVERITIES.indexOf(f.severity) <= maxRank)
    .sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.ruleId.localeCompare(b.ruleId),
    );
  const count = (s: Severity) => kept.filter((f) => f.severity === s).length;
  return {
    report: {
      summary: {
        files: analysed,
        high: count("high"),
        medium: count("medium"),
        low: count("low"),
        info: count("info"),
      },
      findings: kept,
    },
    errors,
  };
}
