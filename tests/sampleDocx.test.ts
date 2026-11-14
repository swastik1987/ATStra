/**
 * Writes sample DOCX files from synthetic fixtures for the manual check in CLAUDE.md phase 4:
 * "Opens in Word and Google Docs with real headings and list items."
 * Run: set WRITE_SAMPLE_DOCX=1 && npx vitest run tests/sampleDocx.test.ts  (output in samples/, git-ignored)
 */
import { describe, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { Packer } from "docx";
import { buildCvDocument } from "../src/lib/docx/build.ts";
import type { Style } from "../supabase/functions/_shared/parseCv.ts";
import { fixtureCv } from "./fixtures/suggestionContext.ts";

const base: Style = {
  section_order: ["summary", "experience", "education", "skills", "other:Certifications"],
  heading_labels: { summary: "Summary", experience: "Experience", education: "Education", skills: "Skills", "other:Certifications": "Certifications" },
  font_class: "sans",
  accent_color: "#1F3A5F",
  name_align: "left",
  bullet_style: "disc",
  source_columns: 1,
};

describe.skipIf(process.env.WRITE_SAMPLE_DOCX !== "1")("sample DOCX files", () => {
  it("writes a sans and a serif sample", async () => {
    mkdirSync("samples", { recursive: true });
    const cv = fixtureCv();
    cv.other = [{ heading: "Certifications", items: ["Looker LookML Developer"] }];
    const variants: [string, Style][] = [
      ["sample-sans-navy.docx", base],
      ["sample-serif-burgundy-centred.docx", { ...base, font_class: "serif", accent_color: "#7A1F2B", name_align: "center", bullet_style: "dash" }],
    ];
    for (const [name, style] of variants) {
      writeFileSync(`samples/${name}`, new Uint8Array(await Packer.toBuffer(buildCvDocument(cv, style))));
    }
  });
});
