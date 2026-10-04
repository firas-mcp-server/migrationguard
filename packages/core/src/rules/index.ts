import type { Rule } from "../types.js";
import { mg001 } from "./mg001.js";

export const rules: Rule[] = [mg001];

export function getRule(id: string): Rule | undefined {
  return rules.find((r) => r.id === id.toUpperCase());
}
