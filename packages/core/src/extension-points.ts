// Interfaces only, so Pro features can plug in without changing core. No implementations here.
import type { Finding, Rule } from "./types.js";

export interface LockEstimate {
  table: string;
  estimatedLockMs: number;
  tableRows: number;
}

/** Pro: estimates lock time for a finding using staging DB stats. */
export interface LockEstimator {
  estimate(finding: Finding): Promise<LockEstimate | undefined>;
}

/** Pro: loads extra rules (for example from a team config). */
export interface RuleLoader {
  load(): Promise<Rule[]>;
}
