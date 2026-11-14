/**
 * Validation of every model suggestion (CLAUDE.md section 5). Runs after the model call and
 * before anything is stored. Pure and unit-tested. Order:
 *   target check -> evidence check -> number check -> entity check -> length check -> cap.
 * The user's review of each card remains the real safeguard; this removes what code can prove.
 */
import { getAt } from "./pointer.ts";
import { findTerm, pointsFor, type PointsContext } from "./points.ts";
import { cvText, phrasePattern, termFound, type Category, type JdTerm } from "./scoring.ts";
import { METRIC, type SuggestionType } from "./suggestionTypes.ts";
import { normaliseForMatch, wordTokens } from "./text.ts";

export { METRIC } from "./suggestionTypes.ts";

export const MAX_SUGGESTIONS = 12;
export const LENGTH_FACTOR = 1.3;
const MAX_APPEND_CHARS = 160;

export interface ModelSuggestion {
  type: "rewrite" | "keyword" | "quantify" | "unverified_keyword";
  section_ref: string;
  before_text: string;
  after_text: string;
  evidence_quote: string;
  term: string;
}

export interface DraftSuggestion {
  type: SuggestionType;
  category: Category;
  section_ref: string;
  before_text: string;
  after_text: string;
  evidence_quote: string;
  points: number;
  rank: number;
  term: string;
}

export type DropReason =
  | "target_mismatch"
  | "evidence_not_in_cv"
  | "metric_placeholder"
  | "new_entity"
  | "too_long"
  | "no_change"
  | "term_not_in_jd"
  | "already_covered"
  | "duplicate"
  | "term_not_in_text";

export interface ValidationReport {
  kept: DraftSuggestion[];
  dropped: { suggestion: ModelSuggestion; reason: DropReason }[];
  converted: { suggestion: ModelSuggestion; to: SuggestionType; reason: "number_not_in_cv" | "jd_term_not_in_cv" }[];
}

const NUMBER = /\d+(?:[.,]\d+)*/g;
const NUMBER_WITH_UNIT = /[£$€]?\d+(?:[.,]\d+)*\s?(?:%|percent\b|[kmb]n?\b|x\b)?/gi;
const countMetric = (s: string) => s.split(METRIC).length - 1;
const estimateLength = (s: string) => s.replace(METRIC, "10%").length;

function categoryFor(type: SuggestionType, ref: string): Category {
  if (type === "keyword" || type === "unverified_keyword") return "keyword_coverage";
  if (type === "quantify") return "evidence_impact";
  return /^\/(summary|headline)$/.test(ref) ? "title_summary" : "evidence_impact";
}

/** Where an Unverified keyword should be added by default: the role, summary or skills list. */
function appendTarget(ref: string): string {
  const role = ref.match(/^\/experience\/(\d+)\//);
  if (role) return `/experience/${role[1]}/bullets`;
  if (ref.startsWith("/skills")) return "/skills";
  if (ref === "/summary" || ref === "/headline") return "/summary";
  return "/skills";
}

/** Capitalised words that are not the first word of a sentence. */
function capitalisedTokens(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?;:])\s+|\s+[-–]\s+/)) {
    const words = sentence.split(/\s+/).filter(Boolean);
    words.slice(1).forEach((w) => {
      const clean = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, "");
      if (clean && clean !== METRIC.slice(1, -1) && /^\p{Lu}/u.test(clean)) out.push(clean);
    });
  }
  return out;
}

export function validateSuggestions(raw: ModelSuggestion[], ctx: PointsContext, generated: DraftSuggestion[] = []): ValidationReport {
  const report: ValidationReport = { kept: [], dropped: [], converted: [] };
  const cvAll = cvText(ctx.cv);
  const cvNorm = normaliseForMatch(cvAll);
  const cvWords = new Set(wordTokens(cvAll));
  const cvNumbers = new Set(cvAll.match(NUMBER) ?? []);
  const seen = new Set<string>();
  const drop = (suggestion: ModelSuggestion, reason: DropReason) => report.dropped.push({ suggestion, reason });

  for (const original of raw) {
    const s: ModelSuggestion = {
      type: original.type,
      section_ref: original.section_ref.trim(),
      before_text: original.before_text.trim(),
      after_text: original.after_text.trim(),
      evidence_quote: original.evidence_quote.trim(),
      term: original.term.trim(),
    };
    let type: SuggestionType = s.type;
    let after = s.after_text;
    let term = s.term;
    let ref = s.section_ref;

    // Target: before_text must be the CV's text at section_ref (or empty when appending to a list).
    const target = getAt(ctx.cv, ref);
    const appending = Array.isArray(target) && s.before_text === "";
    if (!appending && (typeof target !== "string" || normaliseForMatch(target) !== normaliseForMatch(s.before_text))) {
      if (type !== "unverified_keyword" || target === undefined) {
        drop(original, "target_mismatch");
        continue;
      }
    }

    // Unverified keyword proposed directly by the model: the term must be a JD term missing from the CV.
    if (type === "unverified_keyword") {
      const jd = findTerm(ctx.jdTerms, term);
      if (!jd) {
        drop(original, "term_not_in_jd");
        continue;
      }
      if (termFound(jd.term, jd.synonyms, cvAll)) {
        drop(original, "already_covered");
        continue;
      }
    }

    // 1. Evidence check.
    if (type === "rewrite" || type === "keyword") {
      const quote = normaliseForMatch(s.evidence_quote);
      if (!quote || !cvNorm.includes(quote)) {
        drop(original, "evidence_not_in_cv");
        continue;
      }
    }

    // A Quantify suggestion carries exactly one placeholder for the user's metric.
    if (type === "quantify" && countMetric(after) !== 1) {
      drop(original, "metric_placeholder");
      continue;
    }

    // 2. Number check: invented numbers become a Quantify placeholder.
    if (type !== "unverified_keyword") {
      const beforeNumbers = new Set(s.before_text.match(NUMBER) ?? []);
      const invented = (after.match(NUMBER) ?? []).filter((n) => !beforeNumbers.has(n) && !cvNumbers.has(n));
      if (invented.length) {
        after = after
          .replace(NUMBER_WITH_UNIT, (m) => ((m.match(NUMBER) ?? []).some((n) => invented.includes(n)) ? METRIC : m))
          .replace(new RegExp(`(${METRIC.replace(/[[\]]/g, "\\$&")}\\s*)+`, "g"), `${METRIC} `)
          .trim();
        if (countMetric(after) !== 1) {
          drop(original, "metric_placeholder");
          continue;
        }
        type = "quantify";
        report.converted.push({ suggestion: original, to: "quantify", reason: "number_not_in_cv" });
      }
    }

    // 3. Entity check.
    if (type !== "unverified_keyword") {
      const allowed: JdTerm[] = [];
      const ownTerm = type === "keyword" ? findTerm(ctx.jdTerms, term) : undefined;
      if (type === "keyword" && !ownTerm) {
        drop(original, "term_not_in_jd");
        continue;
      }
      if (ownTerm) {
        // A Keyword edit exists to add its JD term; wording that misses the exact term adds nothing.
        if (!termFound(ownTerm.term, ownTerm.synonyms, after)) {
          drop(original, "term_not_in_text");
          continue;
        }
        allowed.push(ownTerm);
      }
      const ownWords = new Set(allowed.flatMap((t) => [t.term, ...t.synonyms]).flatMap(wordTokens));
      const newTerm = ctx.jdTerms.find(
        (t) =>
          t !== ownTerm &&
          termFound(t.term, t.synonyms, after) &&
          !termFound(t.term, t.synonyms, cvAll) &&
          !termFound(t.term, t.synonyms, s.before_text),
      );
      if (newTerm) {
        type = "unverified_keyword";
        term = newTerm.term;
        ref = appendTarget(ref);
        report.converted.push({ suggestion: original, to: "unverified_keyword", reason: "jd_term_not_in_cv" });
      } else {
        let scrubbed = after;
        for (const t of allowed) {
          const re = phrasePattern([t.term, ...t.synonyms]);
          if (re) scrubbed = scrubbed.replace(new RegExp(re.source, "giu"), " ");
        }
        const beforeWords = new Set(wordTokens(s.before_text));
        const unknown = capitalisedTokens(scrubbed).filter((tok) => {
          const words = wordTokens(tok);
          return words.length > 0 && words.some((w) => !cvWords.has(w) && !beforeWords.has(w) && !ownWords.has(w));
        });
        if (unknown.length) {
          drop(original, "new_entity");
          continue;
        }
      }
    } else {
      ref = Array.isArray(target) ? ref : appendTarget(ref);
    }

    // 4. Length check (the user writes Unverified keyword text themselves).
    if (type !== "unverified_keyword") {
      if (normaliseForMatch(after) === normaliseForMatch(s.before_text)) {
        drop(original, "no_change");
        continue;
      }
      const limit = s.before_text ? s.before_text.length * LENGTH_FACTOR : MAX_APPEND_CHARS;
      if (estimateLength(after) > limit) {
        drop(original, "too_long");
        continue;
      }
    }

    const key = type === "unverified_keyword" ? `u:${normaliseForMatch(term)}` : `${ref}|${normaliseForMatch(after)}`;
    if (seen.has(key)) {
      drop(original, "duplicate");
      continue;
    }
    seen.add(key);

    const draft: DraftSuggestion = {
      type,
      category: categoryFor(type, ref),
      section_ref: ref,
      before_text: type === "unverified_keyword" ? "" : s.before_text,
      after_text: after,
      evidence_quote: s.evidence_quote,
      points: 0,
      rank: 0,
      term,
    };
    draft.points = pointsFor({ ...draft }, ctx, "estimate");
    report.kept.push(draft);
  }

  // An Unverified keyword is redundant when a verified Keyword suggestion covers the same term.
  const verified = new Set(report.kept.filter((k) => k.type === "keyword").map((k) => normaliseForMatch(k.term)));
  report.kept = report.kept.filter((k) => k.type !== "unverified_keyword" || !verified.has(normaliseForMatch(k.term)));

  // 5. Cap: at most 12 in total, ranked by points (stable for ties).
  const all = [...report.kept, ...generated].map((d, i) => ({ d, i }));
  all.sort((a, b) => b.d.points - a.d.points || a.i - b.i);
  report.kept = all.slice(0, MAX_SUGGESTIONS).map(({ d }, i) => ({ ...d, rank: i + 1 }));
  return report;
}

