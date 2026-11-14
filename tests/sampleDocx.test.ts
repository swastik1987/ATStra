/**
 * Writes one sample DOCX per template, fonts embedded, from synthetic fixtures, for the manual
 * check: "Opens in Word and Google Docs with real headings and list items."
 * Run: set WRITE_SAMPLE_DOCX=1 && npx vitest run tests/sampleDocx.test.ts  (output in samples/, git-ignored)
 */
import { describe, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Packer } from "docx";
import { buildCvDocument } from "../src/lib/docx/build.ts";
import { TEMPLATES, TEMPLATE_IDS, loadTemplateFonts } from "../src/lib/docx/templates.ts";
import type { Style } from "../supabase/functions/_shared/parseCv.ts";
import { fixtureCv } from "./fixtures/suggestionContext.ts";

const style: Style = {
  section_order: ["summary", "experience", "education", "skills", "other:Certifications"],
  heading_labels: { summary: "Summary", experience: "Experience", education: "Education", skills: "Skills", "other:Certifications": "Certifications" },
  font_class: "sans",
  accent_color: null,
  name_align: "left",
  bullet_style: "disc",
  source_columns: 1,
};

describe.skipIf(process.env.WRITE_SAMPLE_DOCX !== "1")("sample DOCX files", () => {
  it("writes one sample per template, fonts embedded", async () => {
    mkdirSync("samples", { recursive: true });
    const cv = fixtureCv();
    cv.other = [{ heading: "Certifications", items: ["Looker LookML Developer"] }];
    for (const id of TEMPLATE_IDS) {
      const template = TEMPLATES[id];
      const fonts = await loadTemplateFonts(template, async (f) => new Uint8Array(readFileSync(`public/fonts/${f}`)));
      const bytes = new Uint8Array(await Packer.toBuffer(buildCvDocument(cv, style, { template, fonts })));
      writeFileSync(`samples/template-${id}.docx`, bytes);
    }
  });
});
