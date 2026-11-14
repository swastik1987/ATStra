/**
 * CLAUDE.md section 10, "Multi-column PDF": analysis continues, the parse check flags it,
 * and the export is single column. Reproduced end to end with the two-column fixture.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { Packer } from "docx";
import JSZip from "jszip";
import { extractPdfText } from "../src/lib/pdfText.ts";
import { buildParseChecks, normaliseStyle, type ParseOutput } from "../supabase/functions/_shared/parseCv.ts";
import { generateTemplateSuggestions } from "../supabase/functions/_shared/analyse.ts";
import { scoreCv } from "../src/lib/scoring.ts";
import { buildCvDocument } from "../src/lib/docx/build.ts";
import { fixtureCv } from "./fixtures/suggestionContext.ts";

describe("multi-column PDF", () => {
  it("is flagged, gets a Format suggestion, and exports as one column", async () => {
    const ex = await extractPdfText(pdfjs, new Uint8Array(readFileSync("tests/fixtures/cv-two-column.pdf")));
    expect(ex.isScanned).toBe(false); // analysis continues
    const cv = fixtureCv();
    const out: ParseOutput = {
      structured: cv,
      sections: [
        { key: "summary", label: "Summary" },
        { key: "experience", label: "Experience" },
      ],
      style: { font_class: "sans", accent_color: "#1F3A5F", name_align: "left", bullet_style: "disc" },
      layout: { source_columns: 2, has_tables: false, has_text_boxes: false },
    };
    const style = normaliseStyle(out);
    const checks = buildParseChecks({ page_count: 1, browser: ex.checks }, out, style, []);
    expect(checks.checks.single_column).toMatchObject({ pass: false, label: "2 columns: exported as one column" });

    const base = scoreCv({ cv, pageCount: 1, parseChecks: checks.checks, jdTerms: [], roleTitle: "Senior Data Analyst", spellingErrors: [] });
    expect(base.categories.parse_safety.score).toBe(16);
    const fixes = generateTemplateSuggestions(cv, style, { page_count: 1, checks: checks.checks }, base, []);
    expect(fixes.map((f) => f.section_ref)).toContain("/_format/single_column");

    const zip = await JSZip.loadAsync(await Packer.toBuffer(buildCvDocument(cv, style)));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).not.toMatch(/<w:cols w:num="[2-9]"/);
    expect(xml).not.toMatch(/<w:tbl>/);
  });
});
