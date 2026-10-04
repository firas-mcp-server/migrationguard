import type { Analysis } from "../analyze.js";

/** JSON matching `Report`; an `errors` array is added only when some file could not be analysed. */
export function renderJson({ report, errors }: Analysis): string {
  return JSON.stringify(errors.length ? { ...report, errors } : report, null, 2);
}
