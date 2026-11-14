/**
 * Apply accepted suggestions to a copy of the structured CV (CLAUDE.md section 9, apply logic).
 * Pure. Shared by the browser (src/lib/applyEdits.ts) and the points module.
 */
import type { StructuredCv } from "./parseCv.ts";
import { getAt, isTemplateRef, setAt } from "./pointer.ts";
import { termFound } from "./scoring.ts";
import { METRIC, type Suggestion } from "./suggestionTypes.ts";

export { METRIC, type Suggestion } from "./suggestionTypes.ts";

/** The text a suggestion would put into the CV, or "" if it has none yet. */
export function effectiveText(s: Suggestion): string {
  switch (s.type) {
    case "unverified_keyword":
      return (s.user_text ?? "").trim();
    case "quantify": {
      const metric = (s.user_text ?? "").trim();
      const text = s.edited_text ?? s.after_text;
      return metric ? text.replace(METRIC, metric) : text;
    }
    default:
      return s.edited_text ?? s.after_text;
  }
}

/** F13, F14: the rules that must hold before a suggestion can be accepted. */
export function canAccept(s: Suggestion): boolean {
  if (s.type === "quantify") {
    const text = effectiveText(s);
    return /\d/.test(s.user_text ?? "") && !text.includes(METRIC);
  }
  if (s.type === "unverified_keyword") {
    const text = (s.user_text ?? "").trim();
    return s.confirmed && text.length > 0 && termFound(s.term, [], text);
  }
  return true;
}

export interface ApplyResult {
  cv: StructuredCv;
  applied: Suggestion[];
  /** Lower-ranked accepted suggestions that target text a higher-ranked one already changed. */
  conflicts: { id: string; with: string }[];
  /** Template-level fixes (single column, tables, dates, header/footer). */
  templateFixes: string[];
  /** Heading label changes from accepted Format suggestions, keyed by section. */
  headingLabels: Record<string, string>;
}

function joinSentence(base: string, extra: string): string {
  const b = base.trim();
  if (!b) return extra;
  return /[.!?]$/.test(b) ? `${b} ${extra}` : `${b}. ${extra}`;
}

export function applyEdits(cv: StructuredCv, suggestions: Suggestion[]): ApplyResult {
  const out = structuredClone(cv);
  const result: ApplyResult = { cv: out, applied: [], conflicts: [], templateFixes: [], headingLabels: {} };
  const replacedBy = new Map<string, string>();
  const appendedBy = new Map<string, string>();

  const accepted = suggestions.filter((s) => s.status === "accepted" && canAccept(s)).sort((a, b) => a.rank - b.rank);
  for (const s of accepted) {
    if (isTemplateRef(s.section_ref)) {
      const label = s.section_ref.match(/^\/_style\/heading_labels\/(.+)$/);
      if (label) result.headingLabels[label[1]] = s.after_text;
      else result.templateFixes.push(s.section_ref.replace(/^\/_format\//, ""));
      result.applied.push(s);
      continue;
    }
    const text = effectiveText(s);
    if (!text) continue;
    const target = getAt(out, s.section_ref);
    if (Array.isArray(target)) {
      target.push(text);
      result.applied.push(s);
      continue;
    }
    if (typeof target !== "string") continue;

    const isAppend = s.before_text === "";
    const earlier = replacedBy.get(s.section_ref) ?? (isAppend ? undefined : appendedBy.get(s.section_ref));
    if (earlier) {
      result.conflicts.push({ id: s.id, with: earlier });
      continue;
    }
    setAt(out, s.section_ref, isAppend ? joinSentence(target, text) : text);
    (isAppend ? appendedBy : replacedBy).set(s.section_ref, s.id);
    result.applied.push(s);
  }
  return result;
}
