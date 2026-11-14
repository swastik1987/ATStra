/**
 * The published scoring rubric (CLAUDE.md section 4). Pure and deterministic: the same
 * inputs always give the same score. Shared by the browser (src/lib/scoring.ts re-exports
 * it) and the analyse edge function. The model never produces a score.
 */
import type { ParseChecks, StructuredCv } from "./parseCv.ts";
import { normaliseForMatch, wordTokens } from "./text.ts";

/** Category weights. Tune here; nothing else hard-codes them. */
export const WEIGHTS = {
  keyword_coverage: 35,
  title_summary: 15,
  evidence_impact: 20,
  parse_safety: 20,
  hygiene: 10,
} as const;
export type Category = keyof typeof WEIGHTS;

export const CATEGORY_LABELS: Record<Category, string> = {
  keyword_coverage: "Keyword coverage",
  title_summary: "Title and summary fit",
  evidence_impact: "Evidence and impact",
  parse_safety: "Parse safety",
  hygiene: "Hygiene",
};

const MUST_WEIGHT = 2;
const NICE_WEIGHT = 1;
const EARLY_WORDS = 60;
const MAX_PAGES = 2;

export interface JdTerm {
  term: string;
  synonyms: string[];
  importance: "must" | "nice";
  is_domain: boolean;
  jd_count: number;
  found_in_cv: boolean;
}

export interface ScoreInput {
  cv: StructuredCv;
  pageCount: number | undefined;
  parseChecks: ParseChecks["checks"] | undefined;
  jdTerms: JdTerm[];
  roleTitle: string;
  spellingErrors: string[];
}

export interface CategoryScore {
  score: number;
  max: number;
  checks?: Record<string, boolean>;
  detail?: Record<string, unknown>;
}

export interface Score {
  total: number;
  categories: Record<Category, CategoryScore>;
}

// ---------- text helpers ----------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** Whole-word, case-insensitive pattern for a term and its synonyms (optional plural). */
export function phrasePattern(phrases: string[]): RegExp | null {
  const alts = [...new Set(phrases.map((p) => normaliseForMatch(p)).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map((p) => escapeRe(p).replace(/\\? /g, "\\s+"));
  if (!alts.length) return null;
  // Whole words, optional plural ending.
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join("|")})(?:s|es)?(?![\\p{L}\\p{N}])`, "giu");
}

export function termFound(term: string, synonyms: string[], text: string): boolean {
  const re = phrasePattern([term, ...synonyms]);
  return re ? re.test(normaliseForMatch(text)) : false;
}

export function countInText(term: string, synonyms: string[], text: string): number {
  const re = phrasePattern([term, ...synonyms]);
  return re ? (normaliseForMatch(text).match(re) ?? []).length : 0;
}

/** All CV text that an ATS would read, excluding contact details. */
export function cvText(cv: StructuredCv): string {
  const parts: string[] = [cv.headline, cv.summary];
  for (const r of cv.experience) parts.push(r.title, r.company, r.location, ...r.bullets);
  for (const e of cv.education) parts.push(e.degree, e.institution);
  parts.push(...cv.skills);
  for (const o of cv.other) parts.push(o.heading, ...o.items);
  return parts.filter(Boolean).join("\n");
}

// ---------- keyword coverage ----------

function keywordCoverage(cv: StructuredCv, terms: JdTerm[]): CategoryScore {
  const text = cvText(cv);
  let total = 0;
  let found = 0;
  const foundTerms: string[] = [];
  const missingTerms: string[] = [];
  for (const t of terms) {
    const w = t.importance === "must" ? MUST_WEIGHT : NICE_WEIGHT;
    total += w;
    if (termFound(t.term, t.synonyms, text)) {
      found += w;
      foundTerms.push(t.term);
    } else missingTerms.push(t.term);
  }
  return {
    score: total ? Math.round((WEIGHTS.keyword_coverage * found) / total) : 0,
    max: WEIGHTS.keyword_coverage,
    detail: { found: foundTerms, missing: missingTerms },
  };
}

// ---------- title and summary fit ----------

const LEVELS: Record<string, string> = {
  intern: "intern",
  graduate: "graduate",
  junior: "junior",
  jr: "junior",
  associate: "associate",
  mid: "mid",
  senior: "senior",
  sr: "senior",
  lead: "lead",
  staff: "staff",
  principal: "principal",
  head: "head",
  director: "director",
  vp: "vp",
  chief: "chief",
};
const TITLE_STOP = new Set(["of", "and", "the", "for", "a", "an", "in", "i", "ii", "iii", "iv", "level"]);

function titleParts(title: string): { core: string[]; level: string | null } {
  let level: string | null = null;
  const core: string[] = [];
  for (const t of wordTokens(title)) {
    if (LEVELS[t]) level ??= LEVELS[t];
    else if (!TITLE_STOP.has(t)) core.push(t);
  }
  return { core, level };
}

/** The headline or latest job title names the target role and its level. */
export function roleLevelMatch(roleTitle: string, cv: StructuredCv): boolean {
  const target = titleParts(roleTitle);
  if (!target.core.length) return false;
  const candidates = [cv.headline, cv.experience[0]?.title ?? ""].filter(Boolean).map(titleParts);
  return candidates.some((c) => target.core.every((w) => c.core.includes(w)) && (target.level === null || c.level === target.level));
}

/** Must-have terms first, then by how often the JD repeats them, then JD order. */
export function topTerms(terms: JdTerm[], n: number): JdTerm[] {
  return terms
    .map((t, i) => ({ t, i }))
    .sort(
      (a, b) =>
        (a.t.importance === "must" ? 0 : 1) - (b.t.importance === "must" ? 0 : 1) || b.t.jd_count - a.t.jd_count || a.i - b.i,
    )
    .slice(0, n)
    .map((x) => x.t);
}

function titleSummary(cv: StructuredCv, terms: JdTerm[], roleTitle: string): CategoryScore {
  const summaryText = `${cv.headline}\n${cv.summary}`;
  const domain = terms.filter((t) => t.is_domain);
  const early = normaliseForMatch(summaryText).split(" ").slice(0, EARLY_WORDS).join(" ");
  const top = topTerms(terms, 3);
  const checks = {
    role_level_match: roleLevelMatch(roleTitle, cv),
    domain_in_summary: domain.some((t) => termFound(t.term, t.synonyms, summaryText)),
    top_terms_early: top.length > 0 && top.every((t) => termFound(t.term, t.synonyms, early)),
  };
  const per = WEIGHTS.title_summary / 3;
  return {
    score: Math.round(Object.values(checks).filter(Boolean).length * per),
    max: WEIGHTS.title_summary,
    checks,
    detail: { top_terms: top.map((t) => t.term) },
  };
}

// ---------- evidence and impact ----------

const NUMBER_WORDS =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|hundreds|thousand|thousands|million|millions|billion|half|double|triple|tenfold)\b/i;
const OUTCOME =
  /\b(?:increas(?:ed|ing)|reduc(?:ed|ing)|cut|cutting|sav(?:ed|ing)|grew|grow(?:ing|n)|improv(?:ed|ing)|boost(?:ed|ing)|lower(?:ed|ing)|rais(?:ed|ing)|doubl(?:ed|ing)|tripl(?:ed|ing)|halv(?:ed|ing)|accelerat(?:ed|ing)|decreas(?:ed|ing)|generat(?:ed|ing)|achiev(?:ed|ing)|exceed(?:ed|ing)|drove|driving|won|winning|secur(?:ed|ing)|expand(?:ed|ing)|shorten(?:ed|ing)|eliminat(?:ed|ing)|prevent(?:ed|ing)|recover(?:ed|ing)|deliver(?:ed|ing)|lift(?:ed|ing)|add(?:ed|ing)|freeing|freed|recouped|worth)\b|\bresulting in\b|\bleading to\b|\bfrom\b.+\bto\b/i;

/** A bullet carries a number (digit, %, currency or number word) and an outcome. */
export function isQuantified(bullet: string): boolean {
  const hasNumber = /\d/.test(bullet) || NUMBER_WORDS.test(bullet);
  return hasNumber && OUTCOME.test(bullet);
}

function evidenceImpact(cv: StructuredCv): CategoryScore {
  const bullets = cv.experience.slice(0, 2).flatMap((r) => r.bullets).filter((b) => b.trim());
  const quantified = bullets.filter(isQuantified).length;
  return {
    score: bullets.length ? Math.round((WEIGHTS.evidence_impact * quantified) / bullets.length) : 0,
    max: WEIGHTS.evidence_impact,
    detail: { quantified, total: bullets.length },
  };
}

// ---------- parse safety ----------

const PARSE_KEYS = ["text_extractable", "single_column", "standard_headings", "header_footer_clear", "no_tables_or_text_boxes"] as const;

function parseSafety(checks: ScoreInput["parseChecks"]): CategoryScore {
  const result = Object.fromEntries(PARSE_KEYS.map((k) => [k, checks?.[k]?.pass === true])) as Record<string, boolean>;
  const per = WEIGHTS.parse_safety / PARSE_KEYS.length;
  return { score: Math.round(Object.values(result).filter(Boolean).length * per), max: WEIGHTS.parse_safety, checks: result };
}

// ---------- hygiene ----------

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const DATE_FAMILIES: [string, RegExp][] = [
  ["month_year", new RegExp(`^(${MONTHS})[a-z]*\\.?\\s+\\d{4}$`, "i")],
  ["mm/yyyy", /^\d{1,2}[/.-]\d{4}$/],
  ["yyyy-mm", /^\d{4}[/.-]\d{1,2}$/],
  ["yyyy", /^\d{4}$/],
];
const CURRENT = /^(present|current|now|ongoing|today)$/i;

function dateFamily(d: string): string {
  const s = d.trim();
  return DATE_FAMILIES.find(([, re]) => re.test(s))?.[0] ?? "other";
}

/** All role dates use one format (education dates are not checked). */
function datesConsistent(cv: StructuredCv): boolean {
  const dates = cv.experience.flatMap((r) => [r.start, r.end]).filter((d) => d.trim() && !CURRENT.test(d.trim()));
  const families = new Set(dates.map(dateFamily));
  return families.size <= 1 && !families.has("other");
}

function hygiene(cv: StructuredCv, pageCount: number | undefined, spellingErrors: string[]): CategoryScore {
  const checks = {
    length: pageCount === undefined ? true : pageCount <= MAX_PAGES,
    date_format: datesConsistent(cv),
    email: /\S+@\S+\.\S+/.test(cv.contact.email),
    phone: (cv.contact.phone.match(/\d/g) ?? []).length >= 7,
    spelling: spellingErrors.length === 0,
  };
  const per = WEIGHTS.hygiene / 5;
  return {
    score: Math.round(Object.values(checks).filter(Boolean).length * per),
    max: WEIGHTS.hygiene,
    checks,
    detail: { spelling_errors: [...spellingErrors] },
  };
}

// ---------- total ----------

export function scoreCv(input: ScoreInput): Score {
  const categories: Record<Category, CategoryScore> = {
    keyword_coverage: keywordCoverage(input.cv, input.jdTerms),
    title_summary: titleSummary(input.cv, input.jdTerms, input.roleTitle),
    evidence_impact: evidenceImpact(input.cv),
    parse_safety: parseSafety(input.parseChecks),
    hygiene: hygiene(input.cv, input.pageCount, input.spellingErrors),
  };
  return { total: Object.values(categories).reduce((n, c) => n + c.score, 0), categories };
}

/** Base score plus the points of accepted suggestions, capped at each category's weight. */
export function projectScore(base: Score, accepted: { category: Category; points: number }[]): Score {
  const categories = structuredClone(base.categories);
  for (const s of accepted) {
    const c = categories[s.category];
    c.score = Math.min(c.max, c.score + Math.max(0, s.points));
  }
  return { total: Object.values(categories).reduce((n, c) => n + c.score, 0), categories };
}
