import type { Rule } from "../types.js";
import { mg001 } from "./mg001.js";
import { mg002 } from "./mg002.js";
import { mg003 } from "./mg003.js";
import { mg004 } from "./mg004.js";
import { mg005 } from "./mg005.js";
import { mg006 } from "./mg006.js";

export const rules: Rule[] = [mg001, mg002, mg003, mg004, mg005, mg006];

export function getRule(id: string): Rule | undefined {
  return rules.find((r) => r.id === id.toUpperCase());
}
