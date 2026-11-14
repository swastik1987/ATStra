/**
 * Core of the analyse function (CLAUDE.md sections 4, 5, 6, 8). The model lists JD terms,
 * possible typos and proposed edits. Whether a term is in the CV, how often the JD uses it,
 * every check, the score and every suggestion's points are computed in code, and every model
 * suggestion passes validate.ts before it is stored. Runtime-neutral and unit-tested.
 */
import { z } from "zod";
import { ModelError, wrapUntrusted, type ContentBlock } from "./model.ts";
import type { ParseChecks, Style, StructuredCv } from "./parseCv.ts";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "./prompts/analyse.v3.ts";
import { DEFAULT_LABELS } from "./headings.ts";
import { WEIGHTS, countInText, cvText, scoreCv, termFound, type JdTerm, type Score } from "./scoring.ts";
import type { Suggestion } from "./suggestionTypes.ts";
import { validateSuggestions, type DraftSuggestion, type ValidationReport } from "./validate.ts";
import { normaliseForMatch, wordTokens } from "./text.ts";

export { PROMPT_VERSION } from "./prompts/analyse.v3.ts";

export const MIN_JD_CHARS = 300;
export const DAILY_CAP = 30;
const MAX_TERMS = 30;

export const AnalyseOutputSchema = z.object({
  role_title: z.string(),
  company: z.string(),
  terms: z.array(
    z.object({
      term: z.string(),
      synonyms: z.array(z.string()),
      importance: z.enum(["must", "nice"]),
      is_domain: z.boolean(),
    }),
  ),
  spelling_errors: z.array(z.object({ word: z.string(), correction: z.string() })),
  suggestions: z.array(
    z.object({
      type: z.enum(["rewrite", "keyword", "quantify", "unverified_keyword"]),
      section_ref: z.string(),
      before_text: z.string(),
      after_text: z.string(),
      evidence_quote: z.string(),
      term: z.string(),
    }),
  ),
});
export type AnalyseOutput = z.infer<typeof AnalyseOutputSchema>;

export interface ApplicationRow {
  id: string;
  cv_id: string | null;
  role_title: string;
  company: string;
  jd_text: string | null;
  jd_terms: JdTerm[] | null;
  base_score: Score | null;
  prompt_version?: string | null;
}

export interface CvForAnalysis {
  structured: StructuredCv | null;
  style?: Style | null;
  parse_checks: (Partial<ParseChecks> & { page_count?: number }) | null;
  raw_text: string | null;
}

export type AnalyseErrorCode = "not_found" | "jd_too_short" | "model_error" | "schema_invalid" | "daily_cap";

export class AnalyseError extends Error {
  constructor(
    public readonly code: AnalyseErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AnalyseError";
  }
}

export interface AnalyseDeps {
  getApplication(id: string): Promise<ApplicationRow | null>;
  getCv(id: string): Promise<CvForAnalysis | null>;
  countAnalyseCallsToday(): Promise<number>;
  callModel(args: { system: string; content: ContentBlock[] }): Promise<{ data: AnalyseOutput; modelId: string }>;
  getSuggestions(applicationId: string): Promise<Suggestion[]>;
  /** Deletes the application's suggestions and stores these. Returns the stored rows. */
  replaceSuggestions(applicationId: string, drafts: DraftSuggestion[]): Promise<Suggestion[]>;
  save(id: string, values: Record<string, unknown>): Promise<void>;
}

export interface AnalyseResult {
  jd_terms: JdTerm[];
  base_score: Score;
  checks: Record<string, Record<string, boolean> | undefined>;
  suggestions: Suggestion[];
  role_title: string;
  company: string;
  prompt_version: string;
  /** Present on a fresh analysis: what validation dropped or converted, for logs and tests. */
  validation?: {
    dropped: number;
    converted: number;
    reasons: string[];
    /** What the model proposed and what happened to it. Owner-only data, returned to the caller. */
    details: { outcome: string; type: string; section_ref: string; before_text: string; after_text: string; evidence_quote: string; term: string }[];
  };
}

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE = /\+?\d[\d\s().-]{6,}\d/g;

/** The CV as sent to the model: no contact block, and no emails or phone numbers anywhere. */
export function cvForModel(cv: StructuredCv): Omit<StructuredCv, "contact"> {
  const scrub = (s: string) => s.replace(EMAIL, "[email removed]").replace(PHONE, "[phone removed]");
  const rest: Partial<StructuredCv> = { ...cv };
  delete rest.contact;
  return JSON.parse(JSON.stringify(rest), (_k, v) => (typeof v === "string" ? scrub(v) : v));
}

function checksOf(score: Score): AnalyseResult["checks"] {
  return { title_summary: score.categories?.title_summary?.checks, hygiene: score.categories?.hygiene?.checks };
}

const PER_PARSE_CHECK = WEIGHTS.parse_safety / 5;
const PER_HYGIENE_CHECK = WEIGHTS.hygiene / 5;
const round2 = (n: number) => Math.round(n * 100) / 100;

function* textPaths(cv: StructuredCv): Generator<{ ref: string; text: string }> {
  yield { ref: "/headline", text: cv.headline };
  yield { ref: "/summary", text: cv.summary };
  for (const [i, r] of cv.experience.entries()) for (const [j, b] of r.bullets.entries()) yield { ref: `/experience/${i}/bullets/${j}`, text: b };
  for (const [i, s] of cv.skills.entries()) yield { ref: `/skills/${i}`, text: s };
  for (const [i, o] of cv.other.entries()) for (const [j, it] of o.items.entries()) yield { ref: `/other/${i}/items/${j}`, text: it };
}

/**
 * Format and Hygiene suggestions are generated in code from the parse checks and the score,
 * never by the model (CLAUDE.md section 5 table).
 */
export function generateTemplateSuggestions(
  cv: StructuredCv,
  style: Style | null | undefined,
  parseChecks: CvForAnalysis["parse_checks"],
  base: Score,
  spelling: { word: string; correction: string }[],
): DraftSuggestion[] {
  const out: DraftSuggestion[] = [];
  const draft = (d: Omit<DraftSuggestion, "rank" | "evidence_quote" | "term">): DraftSuggestion => ({ ...d, rank: 0, evidence_quote: "", term: "" });
  const checks = parseChecks?.checks;

  const templateFixes: [keyof NonNullable<typeof checks>, string, string][] = [
    ["single_column", "Multi-column layout", "Exported as a single column, so it is read in the right order"],
    ["no_tables_or_text_boxes", "Content in tables or text boxes", "Exported as plain paragraphs, without tables or text boxes"],
    ["header_footer_clear", "Text in the page header or footer", "Contact details placed in the body, not the header or footer"],
  ];
  for (const [key, before, after] of templateFixes) {
    if (checks?.[key] && !checks[key].pass) {
      out.push(draft({ type: "format", category: "parse_safety", section_ref: `/_format/${key}`, before_text: before, after_text: after, points: PER_PARSE_CHECK }));
    }
  }

  const nonstandard = checks?.standard_headings && !checks.standard_headings.pass ? checks.standard_headings.nonstandard ?? [] : [];
  for (const label of nonstandard) {
    const key = Object.entries(style?.heading_labels ?? {}).find(([, v]) => v === label)?.[0];
    if (!key) continue;
    const standard = DEFAULT_LABELS[key] ?? (key.startsWith("other:") ? null : null);
    if (!standard) continue;
    out.push(
      draft({
        type: "format",
        category: "parse_safety",
        section_ref: `/_style/heading_labels/${key}`,
        before_text: label,
        after_text: standard,
        points: round2(PER_PARSE_CHECK / nonstandard.length),
      }),
    );
  }

  if (base.categories.hygiene.checks?.date_format === false) {
    out.push(
      draft({
        type: "hygiene",
        category: "hygiene",
        section_ref: "/_format/dates",
        before_text: "Role dates use more than one format",
        after_text: "All role dates shown as MMM YYYY, for example Mar 2021",
        points: PER_HYGIENE_CHECK,
      }),
    );
  }

  const fixes = spelling
    .map(({ word, correction }) => {
      const re = new RegExp(`(?<![\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "u");
      const hit = [...textPaths(cv)].find((p) => re.test(p.text));
      return hit ? { ...hit, after: hit.text.replace(re, correction) } : null;
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
  for (const f of fixes) {
    out.push(
      draft({
        type: "hygiene",
        category: "hygiene",
        section_ref: f.ref,
        before_text: f.text,
        after_text: f.after,
        points: round2(PER_HYGIENE_CHECK / fixes.length),
      }),
    );
  }
  return out;
}

export async function runAnalyse(deps: AnalyseDeps, input: { application_id: string; force?: boolean }): Promise<AnalyseResult> {
  const app = await deps.getApplication(input.application_id);
  if (!app) throw new AnalyseError("not_found", "Application not found");
  const cv = app.cv_id ? await deps.getCv(app.cv_id) : null;
  if (!cv?.structured) throw new AnalyseError("not_found", "The CV for this application has not been read yet");

  if (app.jd_terms && app.base_score && !input.force) {
    return {
      jd_terms: app.jd_terms,
      base_score: app.base_score,
      checks: checksOf(app.base_score),
      suggestions: await deps.getSuggestions(app.id),
      role_title: app.role_title,
      company: app.company,
      prompt_version: app.prompt_version ?? "",
    };
  }

  const jd = (app.jd_text ?? "").trim();
  if (jd.replace(/\s+/g, " ").length < MIN_JD_CHARS) {
    throw new AnalyseError("jd_too_short", "This job description is too short to analyse. Paste the full posting.");
  }
  if ((await deps.countAnalyseCallsToday()) >= DAILY_CAP) {
    throw new AnalyseError("daily_cap", "Daily analysis limit reached. Try again tomorrow.");
  }

  let data: AnalyseOutput;
  let modelId: string;
  try {
    ({ data, modelId } = await deps.callModel({
      system: SYSTEM_PROMPT,
      content: [
        { type: "text", text: wrapUntrusted("JD", jd) },
        { type: "text", text: wrapUntrusted("CV", JSON.stringify(cvForModel(cv.structured), null, 1)) },
        { type: "text", text: "Extract the role, company, JD terms, CV spelling errors and proposed edits." },
      ],
    }));
  } catch (e) {
    if (e instanceof ModelError && e.code === "schema_invalid") throw new AnalyseError("schema_invalid", "Analysis failed. Try again.");
    throw new AnalyseError("model_error", "Analysis failed. Try again.");
  }

  const text = cvText(cv.structured);
  const seen = new Set<string>();
  const jd_terms: JdTerm[] = [];
  for (const t of data.terms) {
    const term = t.term.trim();
    const key = normaliseForMatch(term);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const synonyms = [...new Set(t.synonyms.map((s) => s.trim()).filter((s) => s && normaliseForMatch(s) !== key))].slice(0, 4);
    jd_terms.push({
      term,
      synonyms,
      importance: t.importance,
      is_domain: t.is_domain,
      jd_count: countInText(term, synonyms, jd),
      found_in_cv: termFound(term, synonyms, text),
    });
    if (jd_terms.length >= MAX_TERMS) break;
  }

  // Keep only spelling errors that really occur in the CV and are not JD vocabulary.
  const cvWords = new Set(wordTokens(text));
  const jdVocab = new Set(jd_terms.flatMap((t) => [t.term, ...t.synonyms]).flatMap(wordTokens));
  const spelling = [
    ...new Map(
      data.spelling_errors
        .map((e) => ({ word: e.word.trim(), correction: e.correction.trim() }))
        .filter((e) => /^[\p{L}'-]+$/u.test(e.word) && /^[\p{L}'-]+$/u.test(e.correction) && e.word !== e.correction)
        .filter((e) => cvWords.has(e.word.toLowerCase()) && !jdVocab.has(e.word.toLowerCase()))
        .map((e) => [e.word.toLowerCase(), e]),
    ).values(),
  ];

  const roleTitle = app.role_title.trim() || data.role_title.trim();
  const base_score = scoreCv({
    cv: cv.structured,
    pageCount: cv.parse_checks?.page_count,
    parseChecks: cv.parse_checks?.checks,
    jdTerms: jd_terms,
    roleTitle,
    spellingErrors: spelling.map((s) => s.word),
  });

  const ctx = { cv: cv.structured, jdTerms: jd_terms, base: base_score, roleTitle };
  const generated = generateTemplateSuggestions(cv.structured, cv.style, cv.parse_checks, base_score, spelling);
  const report: ValidationReport = validateSuggestions(data.suggestions, ctx, generated);
  const suggestions = await deps.replaceSuggestions(app.id, report.kept);

  const values: Record<string, unknown> = {
    jd_terms,
    base_score,
    model_id: modelId,
    prompt_version: PROMPT_VERSION,
    status: "reviewing",
  };
  if (!app.role_title.trim() && data.role_title.trim()) values.role_title = data.role_title.trim();
  if (!app.company.trim() && data.company.trim()) values.company = data.company.trim();
  await deps.save(app.id, values);

  return {
    jd_terms,
    base_score,
    checks: checksOf(base_score),
    suggestions,
    role_title: roleTitle,
    company: app.company.trim() || data.company.trim(),
    prompt_version: PROMPT_VERSION,
    validation: {
      dropped: report.dropped.length,
      converted: report.converted.length,
      reasons: [...report.dropped.map((d) => d.reason), ...report.converted.map((c) => `${c.reason}->${c.to}`)],
      details: [
        ...report.dropped.map((d) => ({ outcome: `dropped:${d.reason}`, ...d.suggestion })),
        ...report.converted.map((c) => ({ outcome: `converted:${c.reason}->${c.to}`, ...c.suggestion })),
      ],
    },
  };
}
