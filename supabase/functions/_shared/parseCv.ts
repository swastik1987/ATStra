/**
 * Core of the parse-cv function (CLAUDE.md sections 6, 7, 8). Runtime-neutral and pure
 * apart from the injected dependencies, so it is unit-tested in Vitest.
 */
import { z } from "zod";
import { ModelError, type ContentBlock } from "./model.ts";
import { DEFAULT_LABELS, isStandardHeading } from "./headings.ts";
import { SYSTEM_PROMPT, USER_INSTRUCTION } from "./prompts/parse-cv.v1.ts";
import { normaliseForMatch, wordTokens } from "./text.ts";

export { PROMPT_VERSION } from "./prompts/parse-cv.v1.ts";

export const StructuredCvSchema = z.object({
  contact: z.object({
    name: z.string(),
    email: z.string(),
    phone: z.string(),
    location: z.string(),
    links: z.array(z.string()),
  }),
  headline: z.string(),
  summary: z.string(),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      location: z.string(),
      start: z.string(),
      end: z.string(),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(z.object({ institution: z.string(), degree: z.string(), start: z.string(), end: z.string() })),
  skills: z.array(z.string()),
  other: z.array(z.object({ heading: z.string(), items: z.array(z.string()) })),
});
export type StructuredCv = z.infer<typeof StructuredCvSchema>;

export const ParseOutputSchema = z.object({
  structured: StructuredCvSchema,
  sections: z.array(
    z.object({ key: z.enum(["summary", "experience", "education", "skills", "other"]), label: z.string() }),
  ),
  style: z.object({
    font_class: z.enum(["sans", "serif"]),
    accent_color: z.string(),
    name_align: z.enum(["left", "center", "right"]),
    bullet_style: z.enum(["disc", "circle", "square", "dash", "arrow", "none", "other"]),
  }),
  layout: z.object({
    source_columns: z.number(),
    has_tables: z.boolean(),
    has_text_boxes: z.boolean(),
  }),
});
export type ParseOutput = z.infer<typeof ParseOutputSchema>;

export interface Style {
  section_order: string[];
  heading_labels: Record<string, string>;
  font_class: "sans" | "serif";
  accent_color: string | null;
  name_align: "left" | "center" | "right";
  bullet_style: string;
  source_columns: number;
}

export interface Check {
  pass: boolean;
  label: string;
}

export interface ParseChecks {
  page_count?: number;
  char_count?: number;
  browser?: Record<string, boolean>;
  checks: {
    text_extractable: Check;
    single_column: Check;
    standard_headings: Check & { nonstandard: string[] };
    header_footer_clear: Check;
    no_tables_or_text_boxes: Check;
  };
  transcription: { unmatched: Unmatched[] };
}

export interface Unmatched {
  path: string;
  text: string;
}

export interface CvRow {
  id: string;
  storage_path: string;
  raw_text: string | null;
  structured: unknown;
  style: unknown;
  parse_checks: Record<string, unknown> | null;
}

export type ParseCvErrorCode = "cv_not_found" | "scanned_pdf" | "model_error" | "schema_invalid";

export class ParseCvError extends Error {
  constructor(
    public readonly code: ParseCvErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ParseCvError";
  }
}

export interface ParseCvDeps {
  getCv(id: string): Promise<CvRow | null>;
  downloadPdf(path: string): Promise<Uint8Array>;
  callModel(args: { system: string; content: ContentBlock[] }): Promise<ParseOutput>;
  save(id: string, values: { structured: StructuredCv; style: Style; parse_checks: ParseChecks }): Promise<void>;
}

export interface ParseCvResult {
  structured: StructuredCv;
  style: Style;
  parse_checks: ParseChecks;
}

export const MIN_TEXT_CHARS = 200;

export function normaliseStyle(out: ParseOutput): Style {
  const order: string[] = [];
  const labels: Record<string, string> = {};
  for (const s of out.sections) {
    const label = s.label.trim();
    const key = s.key === "other" ? `other:${label || "Other"}` : s.key;
    if (order.includes(key)) continue;
    order.push(key);
    labels[key] = label || DEFAULT_LABELS[s.key] || "Other";
  }
  const hex = out.style.accent_color.trim();
  return {
    section_order: order,
    heading_labels: labels,
    font_class: out.style.font_class,
    accent_color: /^#[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : null,
    name_align: out.style.name_align,
    bullet_style: out.style.bullet_style,
    source_columns: Math.max(1, Math.round(out.layout.source_columns) || 1),
  };
}

function* strings(value: unknown, path = ""): Generator<{ path: string; text: string }> {
  if (typeof value === "string") {
    if (value.trim()) yield { path, text: value };
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* strings(value[i], `${path}/${i}`);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) yield* strings(v, `${path}/${k}`);
  }
}

/**
 * Every string in the structured CV must come from the PDF's own text: at least 90% of its
 * words must appear in the browser-extracted text. Anything else is reported, so a model
 * rewrite or invention is caught before it can reach an export.
 */
export function checkTranscription(structured: StructuredCv, rawText: string): Unmatched[] {
  const known = new Set(wordTokens(rawText));
  const out: Unmatched[] = [];
  for (const { path, text } of strings(structured)) {
    const tokens = wordTokens(text);
    if (!tokens.length) continue;
    const missing = tokens.filter((t) => !known.has(t)).length;
    if (missing / tokens.length > 0.1) out.push({ path, text });
  }
  return out;
}

export function buildParseChecks(
  stored: Record<string, unknown> | null,
  out: ParseOutput,
  style: Style,
  unmatched: Unmatched[],
): ParseChecks {
  const browser = (stored?.browser ?? {}) as Record<string, boolean>;
  const singleColumn = browser.single_column !== false && style.source_columns === 1;
  const nonstandard = Object.values(style.heading_labels).filter((l) => l && !isStandardHeading(l));
  return {
    page_count: stored?.page_count as number | undefined,
    char_count: stored?.char_count as number | undefined,
    browser,
    checks: {
      text_extractable: {
        pass: browser.text_extractable !== false,
        label: browser.text_extractable !== false ? "Text can be extracted" : "No extractable text",
      },
      single_column: {
        pass: singleColumn,
        label: singleColumn ? "Single column" : `${Math.max(style.source_columns, 2)} columns: exported as one column`,
      },
      standard_headings: {
        pass: nonstandard.length === 0,
        label: nonstandard.length ? `Non-standard headings: ${nonstandard.join(", ")}` : "Standard section headings",
        nonstandard,
      },
      header_footer_clear: {
        pass: browser.header_footer_clear !== false,
        label: browser.header_footer_clear !== false ? "No text in header or footer" : "Text found in header or footer area",
      },
      no_tables_or_text_boxes: {
        pass: !out.layout.has_tables && !out.layout.has_text_boxes,
        label:
          out.layout.has_tables || out.layout.has_text_boxes
            ? `Uses ${[out.layout.has_tables && "tables", out.layout.has_text_boxes && "text boxes"].filter(Boolean).join(" and ")}`
            : "No tables or text boxes",
      },
    },
    transcription: { unmatched },
  };
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export async function runParseCv(deps: ParseCvDeps, input: { cv_id: string; force?: boolean }): Promise<ParseCvResult> {
  const row = await deps.getCv(input.cv_id);
  if (!row) throw new ParseCvError("cv_not_found", "CV not found");
  if (row.structured && !input.force) {
    return { structured: row.structured as StructuredCv, style: row.style as Style, parse_checks: row.parse_checks as unknown as ParseChecks };
  }
  const raw = row.raw_text ?? "";
  if (raw.replace(/\s/g, "").length < MIN_TEXT_CHARS) {
    throw new ParseCvError("scanned_pdf", "This PDF looks scanned. Upload a text-based PDF.");
  }

  let pdf: Uint8Array;
  try {
    pdf = await deps.downloadPdf(row.storage_path);
  } catch {
    throw new ParseCvError("cv_not_found", "The PDF file for this CV is missing");
  }

  let out: ParseOutput;
  try {
    out = await deps.callModel({
      system: SYSTEM_PROMPT,
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: toBase64(pdf) } },
        { type: "text", text: USER_INSTRUCTION },
      ],
    });
  } catch (e) {
    if (e instanceof ModelError && e.code === "schema_invalid") throw new ParseCvError("schema_invalid", e.message);
    throw new ParseCvError("model_error", e instanceof Error ? e.message : "Model call failed");
  }

  const style = normaliseStyle(out);
  const unmatched = checkTranscription(out.structured, raw);
  const parse_checks = buildParseChecks(row.parse_checks, out, style, unmatched);
  await deps.save(row.id, { structured: out.structured, style, parse_checks });
  return { structured: out.structured, style, parse_checks };
}

/** Normalised bullets per role, in order. Used to compare parses of the same CV. */
export function bulletsByRole(cv: StructuredCv): { role: string; bullets: string[] }[] {
  return cv.experience.map((r) => ({
    role: `${normaliseForMatch(r.title)} | ${normaliseForMatch(r.company)}`,
    bullets: r.bullets.map(normaliseForMatch),
  }));
}
