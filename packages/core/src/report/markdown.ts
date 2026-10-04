import { SEVERITIES, type Analysis } from "../analyze.js";
import { getRule } from "../rules/index.js";
import type { Finding, SafeAlternative } from "../types.js";

const LABEL = { high: "High", medium: "Medium", low: "Low", info: "Info" } as const;

function alternative(alt: SafeAlternative): string[] {
  const lines = ["", `**Safer alternative:** ${alt.summary}`, ""];
  alt.steps.forEach((step, i) => {
    lines.push(`${i + 1}. ${step.title}`);
    if (step.sql) lines.push("   ```sql", ...step.sql.split("\n").map((l) => `   ${l}`), "   ```");
    if (step.note) lines.push(`   _${step.note}_`);
  });
  return lines;
}

function section(f: Finding): string[] {
  const title = getRule(f.ruleId)?.title;
  return [
    `### ${f.ruleId}${title ? `: ${title}` : ""}`,
    `\`${f.file}:${f.line}\``,
    "",
    f.message,
    "",
    "```sql",
    f.statement,
    "```",
    "",
    `Why: ${f.explanation}`,
    // Safer alternatives are shown for high severity findings only, to keep the report short.
    ...(f.severity === "high" && f.safeAlternative ? alternative(f.safeAlternative) : []),
    "",
  ];
}

export function renderMarkdown({ report, errors }: Analysis): string {
  const s = report.summary;
  const lines = [
    "# MigrationGuard report",
    "",
    `Analysed ${s.files} file(s): ${s.high} high, ${s.medium} medium, ${s.low} low, ${s.info} info.`,
    "",
  ];
  if (report.findings.length === 0 && errors.length === 0) {
    lines.push(
      "No known risky patterns were found. This does not prove the migration is safe: " +
        "MigrationGuard only checks for the patterns it knows.",
      "",
    );
  }
  for (const sev of SEVERITIES) {
    const group = report.findings.filter((f) => f.severity === sev);
    if (group.length === 0) continue;
    lines.push(`## ${LABEL[sev]} (${group.length})`, "");
    for (const f of group) lines.push(...section(f));
  }
  if (errors.length > 0) {
    lines.push("## Files that could not be analysed", "");
    for (const e of errors) lines.push(`- \`${e.file}\`: ${e.message}`);
    lines.push("");
  }
  return lines.join("\n");
}
