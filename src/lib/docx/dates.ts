/**
 * Template date format (CLAUDE.md section 9): MMM YYYY, and "Present" for a current role.
 * Only reformats what is written: a year stays a year (no month is invented), and anything
 * unrecognised is kept as the user wrote it.
 */
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function monthIndex(word: string): number {
  const w = word.toLowerCase();
  if (w === "sept") return 8;
  return w.length >= 3 ? FULL.findIndex((m) => m.startsWith(w)) : -1;
}

export function normaliseDate(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^(present|current|now|ongoing|today|to date)$/i.test(s)) return "Present";
  const named = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (named) {
    const i = monthIndex(named[1]);
    return i >= 0 ? `${SHORT[i]} ${named[2]}` : s;
  }
  const mmYyyy = s.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (mmYyyy && Number(mmYyyy[1]) >= 1 && Number(mmYyyy[1]) <= 12) return `${SHORT[Number(mmYyyy[1]) - 1]} ${mmYyyy[2]}`;
  const yyyyMm = s.match(/^(\d{4})[/.-](\d{1,2})$/);
  if (yyyyMm && Number(yyyyMm[2]) >= 1 && Number(yyyyMm[2]) <= 12) return `${SHORT[Number(yyyyMm[2]) - 1]} ${yyyyMm[1]}`;
  return s;
}

export function dateRange(start: string, end: string): string {
  const a = normaliseDate(start);
  const b = normaliseDate(end);
  return a && b ? `${a} – ${b}` : a || b;
}
