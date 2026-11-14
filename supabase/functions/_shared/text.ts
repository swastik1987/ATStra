/** Text normalisation shared by the browser, edge functions and tests. Pure. */

/** Hyphen joins across line breaks, bullet glyphs removed, whitespace collapsed, lowercase. */
export function normaliseForMatch(s: string): string {
  return s
    .replace(/(\w)-\s*\n\s*(\w)/g, "$1$2")
    .replace(/[•●▪‣⁃◦·]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Lowercase word tokens (letters and digits). */
export function wordTokens(s: string): string[] {
  return normaliseForMatch(s).match(/[\p{L}\p{N}]+/gu) ?? [];
}
