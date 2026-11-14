/**
 * Best-effort role and company from pasted JD text (F7). Only clear patterns are used;
 * anything uncertain returns "" so the user types it. analyse fills blanks later.
 */
const LABEL_ROLE = /^(?:job\s*title|position|role|title)\s*[:\-–]\s*(.{2,80})$/i;
const LABEL_COMPANY = /^(?:company|employer|organi[sz]ation|hiring\s+company)\s*[:\-–]\s*(.{2,80})$/i;
const AT_PATTERN = /^(.{2,60}?)\s+(?:at|@)\s+([A-Z][\w&.,' -]{1,60})$/;
const ABOUT = /^about\s+(?:us\s*[:\-–]\s*)?([A-Z][\w&.' -]{1,60})$/i;
const PROSE = /\b(we|our|you|are|is|looking|join|about|the|this)\b/i;

function clean(s: string): string {
  return s.replace(/\s*\(.*?\)\s*$/, "").replace(/[|·•].*$/, "").trim();
}

export function guessRoleAndCompany(text: string): { role: string; company: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 40);
  let role = "";
  let company = "";

  for (const l of lines) {
    role ||= clean(l.match(LABEL_ROLE)?.[1] ?? "");
    company ||= clean(l.match(LABEL_COMPANY)?.[1] ?? "");
  }
  if (!role || !company) {
    const at = lines.slice(0, 5).map((l) => l.match(AT_PATTERN)).find(Boolean);
    if (at) {
      role ||= clean(at[1]);
      company ||= clean(at[2]);
    }
  }
  if (!company) {
    const about = lines.map((l) => l.match(ABOUT)).find((m) => m && !/^(the|this|you|us|our)\b/i.test(m[1]));
    if (about) company = clean(about[1]);
  }
  if (!role) {
    const first = lines[0] ?? "";
    const words = first.split(/\s+/).length;
    if (first.length <= 80 && words <= 8 && !PROSE.test(first) && !/[.!?]$/.test(first)) role = clean(first);
  }
  if (!company && lines[1] && role === clean(lines[0] ?? "")) {
    const second = clean(lines[1]);
    if (second.split(/\s+/).length <= 5 && /^[A-Z]/.test(second) && !PROSE.test(second) && !/,/.test(second)) company = second;
  }
  return { role, company };
}
