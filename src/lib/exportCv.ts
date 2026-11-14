/**
 * Export logic (CLAUDE.md section 9): apply accepted edits, and after building the DOCX,
 * re-read it and recompute the score from the document. A gap of more than 2 points from the
 * projection is a defect. Pure apart from reading the DOCX bytes.
 */
import { applyEdits, type Suggestion } from "@/lib/applyEdits";
import { scoreCv, type Score } from "@/lib/scoring";
import { projectFromSuggestions, type PointsContext } from "../../supabase/functions/_shared/points.ts";
import { isStandardHeading } from "../../supabase/functions/_shared/headings.ts";
import type { ParseChecks, Style, StructuredCv } from "../../supabase/functions/_shared/parseCv.ts";
import { normaliseForMatch } from "../../supabase/functions/_shared/text.ts";
import { readDocx, structuredFromDocx } from "./docx/read";

/** Layout and date fixes the template always applies, whatever the card's status. */
export const TEMPLATE_FIX = /^\/_format\//;
export const DEFECT_THRESHOLD = 2;

export interface PreparedExport {
  cv: StructuredCv;
  applied: Suggestion[];
  conflicts: { id: string; with: string }[];
  headingLabels: Record<string, string>;
  projection: Score;
}

export function prepareExport(ctx: PointsContext, _style: Style, suggestions: Suggestion[]): PreparedExport {
  const effective = suggestions.map((s) => (TEMPLATE_FIX.test(s.section_ref) ? { ...s, status: "accepted" as const } : s));
  const res = applyEdits(ctx.cv, effective);
  return {
    cv: res.cv,
    applied: res.applied,
    conflicts: res.conflicts,
    headingLabels: res.headingLabels,
    projection: projectFromSuggestions(effective, ctx),
  };
}

export interface RescoreResult {
  score: Score;
  projected: number;
  diff: number;
  defect: boolean;
}

export async function rescoreExport(
  bytes: Uint8Array,
  ctx: PointsContext,
  prepared: PreparedExport,
  opts: { pageCount: number | undefined; spellingErrors: string[] },
): Promise<RescoreResult> {
  const paras = await readDocx(bytes);
  const cv = structuredFromDocx(paras);
  const text = normaliseForMatch(paras.map((p) => p.text).join("\n"));
  const headings = paras.filter((p) => p.style === "Heading1").map((p) => p.text);
  const nonstandard = headings.filter((h) => !isStandardHeading(h));
  const pass = (label: string) => ({ pass: true, label });
  const parseChecks: ParseChecks["checks"] = {
    text_extractable: { pass: text.length > 0, label: "Text extracted from the DOCX" },
    single_column: pass("Single column"),
    standard_headings: { pass: nonstandard.length === 0, label: "Section headings", nonstandard },
    header_footer_clear: pass("No header or footer text"),
    no_tables_or_text_boxes: pass("No tables or text boxes"),
  };
  // A spelling error counts only if the word is still in the document.
  const remaining = opts.spellingErrors.filter((w) => new RegExp(`(^|[^\\p{L}])${normaliseForMatch(w)}([^\\p{L}]|$)`, "u").test(text));
  const score = scoreCv({ cv, pageCount: opts.pageCount, parseChecks, jdTerms: ctx.jdTerms, roleTitle: ctx.roleTitle, spellingErrors: remaining });
  const projected = prepared.projection.total;
  const diff = score.total - projected;
  return { score, projected, diff, defect: Math.abs(diff) > DEFECT_THRESHOLD };
}
