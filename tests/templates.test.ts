/**
 * The five export templates (CLAUDE.md section 9). Every template must keep the ATS rules,
 * use its own fonts (embedded) and colours, pass contrast, and round-trip through the reader.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Packer } from "docx";
import JSZip from "jszip";
import { buildCvDocument } from "../src/lib/docx/build.ts";
import {
  DEFAULT_TEMPLATE,
  TEMPLATES,
  TEMPLATE_IDS,
  contrastRatio,
  getTemplate,
  textColourPairs,
  loadTemplateFonts,
  type TemplateId,
} from "../src/lib/docx/templates.ts";
import { readDocx, structuredFromDocx } from "../src/lib/docx/read.ts";
import { prepareExport, rescoreExport } from "../src/lib/exportCv.ts";
import { scoreCv } from "../src/lib/scoring.ts";
import type { Suggestion } from "../src/lib/applyEdits.ts";
import type { Style, StructuredCv } from "../supabase/functions/_shared/parseCv.ts";
import { fixtureCv, fixtureTerms } from "./fixtures/suggestionContext.ts";

const style: Style = {
  section_order: ["summary", "experience", "education", "skills", "other:Certifications"],
  heading_labels: { summary: "Summary", experience: "Experience", education: "Education", skills: "Skills", "other:Certifications": "Certifications" },
  font_class: "serif",
  accent_color: "#FF0000",
  name_align: "right",
  bullet_style: "arrow",
  source_columns: 1,
};

function cv(): StructuredCv {
  const c = fixtureCv();
  c.other = [{ heading: "Certifications", items: ["Looker LookML Developer"] }];
  return c;
}

/** Reads font files from public/fonts, as the browser fetches /fonts/<file>. */
const fsLoader = async (file: string) => new Uint8Array(readFileSync(`public/fonts/${file}`));

async function build(id: TemplateId, opts: { embed?: boolean; labels?: Record<string, string> } = {}) {
  const template = getTemplate(id);
  const fonts = opts.embed ? await loadTemplateFonts(template, fsLoader) : undefined;
  const doc = buildCvDocument(cv(), style, { template, fonts, headingLabels: opts.labels ?? {} });
  const bytes = new Uint8Array(await Packer.toBuffer(doc));
  const zip = await JSZip.loadAsync(bytes);
  const read = async (n: string) => (await zip.file(n)?.async("string")) ?? "";
  return {
    bytes,
    files: Object.keys(zip.files),
    document: await read("word/document.xml"),
    styles: await read("word/styles.xml"),
    fontTable: await read("word/fontTable.xml"),
    numbering: await read("word/numbering.xml"),
  };
}

describe("template registry", () => {
  it("offers exactly the five shortlisted templates, Slate first and default", () => {
    expect(TEMPLATE_IDS).toEqual(["slate", "terminal", "axis", "band", "tint"]);
    expect(DEFAULT_TEMPLATE).toBe("slate");
    expect(getTemplate("nope" as TemplateId).id).toBe("slate");
    for (const id of TEMPLATE_IDS) expect(TEMPLATES[id].name).toBeTruthy();
  });

  it("only uses bundled font files that exist", () => {
    for (const id of TEMPLATE_IDS) {
      for (const f of TEMPLATES[id].fontFiles) {
        expect(() => readFileSync(`public/fonts/${f.regular}`), f.regular).not.toThrow();
        if (f.bold) expect(() => readFileSync(`public/fonts/${f.bold}`), f.bold).not.toThrow();
      }
    }
  });
});

describe.each(TEMPLATE_IDS)("template %s", (id) => {
  const t = TEMPLATES[id];

  it("passes 4.5:1 contrast for every text colour on what it sits on", () => {
    for (const [fg, bg, what] of textColourPairs(t)) {
      expect(contrastRatio(fg, bg), `${what}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the ATS rules: one column, A4, no tables, text boxes, images, headers or footers", async () => {
    const x = await build(id);
    expect(x.document).toMatch(/<w:pgSz w:w="11906" w:h="16838"/);
    expect(x.document).toMatch(/w:right="1134"[^>]*w:left="1134"|w:left="1134"[^>]*w:right="1134"/);
    expect(x.document).not.toMatch(/<w:cols w:num="[2-9]"/);
    expect(x.document).not.toMatch(/<w:tbl>|<w:txbxContent|<w:drawing|<v:shape|<w:pict|<w:framePr/);
    expect(x.files.filter((f) => /word\/(header|footer)\d*\.xml/.test(f))).toEqual([]);
    expect(x.files.filter((f) => f.startsWith("word/media/"))).toEqual([]);
  });

  it("uses real Heading 1 styles and real list bullets", async () => {
    const x = await build(id);
    expect([...x.document.matchAll(/<w:pStyle w:val="Heading1"\/>/g)]).toHaveLength(5);
    const bullets = cv().experience.flatMap((r) => r.bullets).length + 1;
    expect([...x.document.matchAll(/<w:numPr>/g)]).toHaveLength(bullets);
    expect(x.numbering).toMatch(/<w:numFmt w:val="bullet"\/>/);
    expect(x.numbering).toContain(`<w:lvlText w:val="${t.bullet.glyph}"/>`);
  });

  it("uses the template's fonts and colours, not the CV's carried-over style", async () => {
    const x = await build(id);
    expect(x.styles).toContain(`w:ascii="${t.fonts.body}"`);
    expect(x.styles + x.document).toContain(`w:ascii="${t.fonts.heading}"`);
    expect(x.styles).not.toMatch(/w:ascii="(Calibri|Cambria)"/);
    expect(x.styles + x.document).not.toContain("FF0000");
    expect(x.styles).toMatch(new RegExp(`w:styleId="Heading1"[\\s\\S]*?<w:color w:val="${t.colours.heading.slice(1)}"/>`));
  });

  it("embeds every font family it uses when fonts are supplied", async () => {
    const x = await build(id, { embed: true });
    for (const f of t.fontFiles) {
      expect(x.fontTable, f.family).toMatch(new RegExp(`w:name="${f.family}"[\\s\\S]*?<w:embedRegular`));
      if (f.bold) expect(x.fontTable, `${f.family} bold`).toMatch(new RegExp(`w:name="${f.family}"[\\s\\S]*?<w:embedBold`));
    }
    expect(x.files.filter((f) => /^word\/fonts\//.test(f)).length).toBeGreaterThanOrEqual(t.fontFiles.length);
  });

  it(`uses paragraph shading only where the spec allows it${t.shading === "none" ? " (none here)" : ""}`, async () => {
    const x = await build(id);
    const shaded = [...x.document.matchAll(/<w:p>(?:(?!<\/w:p>)[\s\S])*?<w:shd [^>]*w:fill="([0-9A-F]{6})"/g)];
    if (t.shading === "none") expect(shaded).toHaveLength(0);
    if (t.shading === "header") {
      expect(shaded.length).toBeGreaterThanOrEqual(3);
      expect(shaded.every((m) => m[1] === t.colours.band!.slice(1))).toBe(true);
    }
    if (t.shading === "headings") {
      const headingParas = [...x.document.matchAll(/<w:p>(?:(?!<\/w:p>)[\s\S])*?<w:pStyle w:val="Heading1"\/>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g)];
      expect(headingParas.every((m) => m[0].includes(`w:fill="${t.colours.headingFill!.slice(1)}"`))).toBe(true);
      expect(shaded).toHaveLength(headingParas.length);
    }
  });

  it("keeps contact details in the body and dates as MMM YYYY after a right tab", async () => {
    const x = await build(id);
    expect(x.document).toContain("alex@example.com");
    expect(x.document).toMatch(/<w:tab w:val="right" w:pos="\d+"\/>/);
    expect(x.document).toContain("Mar 2021");
    expect(x.document).toContain("Present");
  });

  it("round-trips: every heading and bullet in order, structure read back, labels kept", async () => {
    const c = cv();
    const x = await build(id, { labels: { experience: "Career Journey" } });
    const paras = await readDocx(x.bytes);
    const headings = paras.filter((p) => p.style === "Heading1").map((p) => p.text);
    expect(headings).toEqual(["Summary", "Career Journey", "Education", "Skills", "Certifications"]);
    const text = paras.map((p) => p.text);
    let at = -1;
    for (const e of [c.summary, ...c.experience[0].bullets, ...c.experience[1].bullets, ...c.other[0].items]) {
      const i = text.findIndex((tx, n) => n > at && tx === e);
      expect(i, e).toBeGreaterThan(at);
      at = i;
    }
    const back = structuredFromDocx(paras);
    expect(back.contact.name).toBe(c.contact.name);
    expect(back.contact.email).toBe(c.contact.email);
    expect(back.headline).toBe(c.headline);
    expect(back.summary).toBe(c.summary);
    expect(back.experience.map((r) => [r.title, r.company, r.bullets])).toEqual(c.experience.map((r) => [r.title, r.company, r.bullets]));
    expect(back.skills).toEqual(c.skills);
  });

  it("re-scores within 2 points of the projection", async () => {
    const c = fixtureCv();
    const jdTerms = fixtureTerms();
    const pass = { pass: true, label: "" };
    const checks = { text_extractable: pass, single_column: pass, standard_headings: { ...pass, nonstandard: [] }, header_footer_clear: pass, no_tables_or_text_boxes: pass };
    const base = scoreCv({ cv: c, pageCount: 1, parseChecks: checks, jdTerms, roleTitle: "Senior Data Analyst", spellingErrors: [] });
    const ctx = { cv: c, jdTerms, base, roleTitle: "Senior Data Analyst" };
    const accepted: Suggestion = {
      id: "k", type: "keyword", category: "keyword_coverage", section_ref: "/experience/0/bullets/2",
      before_text: c.experience[0].bullets[2], after_text: "Ran A/B testing on routing changes with the operations team",
      evidence_quote: "split tests on routing", points: 7.78, status: "accepted", user_text: null, edited_text: null,
      rank: 1, term: "A/B testing", source: "model", confirmed: false,
    };
    const prepared = prepareExport(ctx, style, [accepted]);
    const doc = buildCvDocument(prepared.cv, style, { template: TEMPLATES[id], headingLabels: prepared.headingLabels });
    const result = await rescoreExport(new Uint8Array(await Packer.toBuffer(doc)), ctx, prepared, { pageCount: 1, spellingErrors: [] });
    expect(Math.abs(result.diff), `diff ${result.diff}`).toBeLessThanOrEqual(2);
  });
});
