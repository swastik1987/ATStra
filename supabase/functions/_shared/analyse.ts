/**
 * Core of the analyse function (CLAUDE.md sections 4, 6, 8). The model only lists JD terms
 * and candidate spelling errors; whether a term is in the CV, how often the JD uses it,
 * every check and the score are computed in code. Runtime-neutral and unit-tested.
 */
import { z } from "zod";
import { ModelError, wrapUntrusted, type ContentBlock } from "./model.ts";
import type { ParseChecks, StructuredCv } from "./parseCv.ts";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "./prompts/analyse.v1.ts";
import { countInText, cvText, scoreCv, termFound, type JdTerm, type Score } from "./scoring.ts";
import { normaliseForMatch, wordTokens } from "./text.ts";

export { PROMPT_VERSION } from "./prompts/analyse.v1.ts";

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
  spelling_errors: z.array(z.string()),
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
}

export interface CvForAnalysis {
  structured: StructuredCv | null;
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
  save(id: string, values: Record<string, unknown>): Promise<void>;
}

export interface AnalyseResult {
  jd_terms: JdTerm[];
  base_score: Score;
  checks: Record<string, Record<string, boolean> | undefined>;
  suggestions: unknown[];
  role_title: string;
  company: string;
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
  return {
    title_summary: score.categories.title_summary.checks,
    hygiene: score.categories.hygiene.checks,
  };
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
      suggestions: [],
      role_title: app.role_title,
      company: app.company,
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
        { type: "text", text: "Extract the role, company, JD terms and CV spelling errors." },
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
        .map((w) => w.trim())
        .filter((w) => /^[\p{L}'-]+$/u.test(w))
        .filter((w) => cvWords.has(w.toLowerCase()) && !jdVocab.has(w.toLowerCase()))
        .map((w) => [w.toLowerCase(), w]),
    ).values(),
  ];

  const roleTitle = app.role_title.trim() || data.role_title.trim();
  const base_score = scoreCv({
    cv: cv.structured,
    pageCount: cv.parse_checks?.page_count,
    parseChecks: cv.parse_checks?.checks,
    jdTerms: jd_terms,
    roleTitle,
    spellingErrors: spelling,
  });

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
    suggestions: [],
    role_title: roleTitle,
    company: app.company.trim() || data.company.trim(),
  };
}
