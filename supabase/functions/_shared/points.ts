/**
 * Points for a suggestion and the projected score (CLAUDE.md section 4). Computed in code
 * from the rubric, never by the model. Pure; shared by the browser and analyse.
 */
import { applyEdits, effectiveText } from "./applyEdits.ts";
import type { StructuredCv } from "./parseCv.ts";
import { getAt, setAt } from "./pointer.ts";
import { WEIGHTS, cvText, isQuantified, scoreCv, termFound, type Category, type JdTerm, type Score } from "./scoring.ts";
import { METRIC, type Suggestion } from "./suggestionTypes.ts";
import { normaliseForMatch } from "./text.ts";

export interface PointsContext {
  cv: StructuredCv;
  jdTerms: JdTerm[];
  base: Score;
  roleTitle: string;
}

/** A metric stand-in used to estimate a Quantify suggestion before the user types one. */
const ESTIMATE_METRIC = "10%";

const round2 = (n: number) => Math.round(n * 100) / 100;

type PointsInput = Pick<Suggestion, "type" | "category" | "section_ref" | "before_text" | "after_text" | "term" | "points"> &
  Partial<Pick<Suggestion, "user_text" | "edited_text" | "status" | "id" | "rank" | "evidence_quote" | "source" | "confirmed">>;

function textFor(s: PointsInput, mode: "estimate" | "effective"): string {
  if (mode === "estimate") {
    // An Unverified keyword is estimated as if the user's wording names the term.
    if (s.type === "unverified_keyword") return s.term;
    return s.after_text.replace(METRIC, ESTIMATE_METRIC);
  }
  const full = {
    id: "",
    rank: 0,
    evidence_quote: "",
    status: "accepted",
    user_text: null,
    edited_text: null,
    source: "model",
    confirmed: false,
    ...s,
  } as Suggestion;
  return effectiveText(full);
}

export function findTerm(terms: JdTerm[], term: string): JdTerm | undefined {
  const key = normaliseForMatch(term);
  return terms.find((t) => normaliseForMatch(t.term) === key);
}

/**
 * Points a suggestion adds to its category.
 * "estimate" uses the model's proposal (for ranking); "effective" uses what would really be
 * inserted, including the user's own metric or wording and any edit.
 */
export function pointsFor(s: PointsInput, ctx: PointsContext, mode: "estimate" | "effective" = "effective"): number {
  const text = textFor(s, mode);
  switch (s.category) {
    case "keyword_coverage": {
      const term = findTerm(ctx.jdTerms, s.term);
      if (!term || !text) return 0;
      if (termFound(term.term, term.synonyms, cvText(ctx.cv))) return 0;
      if (!termFound(term.term, term.synonyms, text)) return 0;
      const total = ctx.jdTerms.reduce((n, t) => n + (t.importance === "must" ? 2 : 1), 0);
      return total ? round2((WEIGHTS.keyword_coverage * (term.importance === "must" ? 2 : 1)) / total) : 0;
    }
    case "evidence_impact": {
      const m = s.section_ref.match(/^\/experience\/([01])\/bullets\/\d+$/);
      if (!m || text.includes(METRIC)) return 0;
      const before = getAt(ctx.cv, s.section_ref);
      if (typeof before !== "string" || isQuantified(before) || !isQuantified(text)) return 0;
      const total = ctx.cv.experience.slice(0, 2).flatMap((r) => r.bullets).filter((b) => b.trim()).length;
      return total ? round2(WEIGHTS.evidence_impact / total) : 0;
    }
    case "title_summary": {
      if (!text) return 0;
      const changed = structuredClone(ctx.cv);
      if (s.before_text === "") {
        const cur = getAt(changed, s.section_ref);
        if (typeof cur !== "string") return 0;
        setAt(changed, s.section_ref, `${cur.trim()} ${text}`.trim());
      } else if (!setAt(changed, s.section_ref, text)) return 0;
      const input = { pageCount: 1, parseChecks: undefined, jdTerms: ctx.jdTerms, roleTitle: ctx.roleTitle, spellingErrors: [] };
      const now = scoreCv({ ...input, cv: ctx.cv }).categories.title_summary.score;
      const after = scoreCv({ ...input, cv: changed }).categories.title_summary.score;
      return Math.max(0, after - now);
    }
    default:
      // Format and Hygiene points are set in code when the suggestion is generated.
      return s.points;
  }
}

/**
 * F12: base score plus the points of accepted suggestions, capped at each category's weight.
 * Conflicting and not-yet-acceptable suggestions do not count; a JD term counts once.
 */
export function projectFromSuggestions(list: Suggestion[], ctx: PointsContext): Score {
  const { applied } = applyEdits(ctx.cv, list);
  if (!applied.length) return structuredClone(ctx.base);
  const add: Partial<Record<Category, number>> = {};
  const termsCounted = new Set<string>();
  for (const s of applied) {
    if (s.category === "keyword_coverage") {
      const key = normaliseForMatch(s.term);
      if (termsCounted.has(key)) continue;
      termsCounted.add(key);
    }
    add[s.category] = (add[s.category] ?? 0) + pointsFor(s, ctx, "effective");
  }
  const categories = structuredClone(ctx.base.categories);
  for (const [cat, pts] of Object.entries(add) as [Category, number][]) {
    const c = categories[cat];
    c.score = Math.min(c.max, Math.round(c.score + pts));
  }
  return { total: Object.values(categories).reduce((n, c) => n + c.score, 0), categories };
}
