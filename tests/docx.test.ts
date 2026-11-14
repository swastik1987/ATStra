import { describe, expect, it } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";
import { buildCvDocument } from "../src/lib/docx/build.ts";
import { normaliseDate } from "../src/lib/docx/dates.ts";
import { exportFileName } from "../src/lib/docx/fileName.ts";
import { readDocx, structuredFromDocx } from "../src/lib/docx/read.ts";
import { prepareExport, rescoreExport } from "../src/lib/exportCv.ts";
import { scoreCv } from "../src/lib/scoring.ts";
import { METRIC, type Suggestion } from "../src/lib/applyEdits.ts";
import type { Style, StructuredCv } from "../supabase/functions/_shared/parseCv.ts";
import { fixtureCv, fixtureTerms } from "./fixtures/suggestionContext.ts";

const sansStyle: Style = {
  section_order: ["summary", "experience", "education", "skills", "other:Certifications"],
  heading_labels: { summary: "Summary", experience: "Experience", education: "Education", skills: "Skills", "other:Certifications": "Certifications" },
  font_class: "sans",
  accent_color: "#1F3A5F",
  name_align: "left",
  bullet_style: "disc",
  source_columns: 2,
};

function cvWithOther(): StructuredCv {
  const cv = fixtureCv();
  cv.experience[1].start = "06/2018";
  cv.experience[1].end = "February 2021";
  cv.other = [{ heading: "Certifications", items: ["Looker LookML Developer"] }];
  return cv;
}

async function build(cv: StructuredCv, style: Style, labels: Record<string, string> = {}) {
  const doc = buildCvDocument(cv, style, { headingLabels: labels });
  const bytes = new Uint8Array(await Packer.toBuffer(doc));
  const zip = await JSZip.loadAsync(bytes);
  const xml = {
    document: await zip.file("word/document.xml")!.async("string"),
    styles: await zip.file("word/styles.xml")!.async("string"),
    numbering: (await zip.file("word/numbering.xml")?.async("string")) ?? "",
    files: Object.keys(zip.files),
  };
  return { bytes, xml };
}

describe("dates", () => {
  it.each([
    ["Mar 2021", "Mar 2021"],
    ["March 2021", "Mar 2021"],
    ["sept 2019", "Sep 2019"],
    ["03/2021", "Mar 2021"],
    ["3.2021", "Mar 2021"],
    ["2021-03", "Mar 2021"],
    ["2019", "2019"],
    ["Present", "Present"],
    ["current", "Present"],
    ["Now", "Present"],
    ["", ""],
    ["Summer 2019", "Summer 2019"],
  ])("%s -> %s", (input, expected) => {
    expect(normaliseDate(input)).toBe(expected);
  });
});

// Template look and ATS rules per template are tested in templates.test.ts.
describe("file name", () => {
  it("is <Name>_<Role>_<Company>.docx with safe characters", () => {
    expect(exportFileName("Alex Morgan", "Senior Data Analyst", "Tailwind Freight")).toBe("Alex-Morgan_Senior-Data-Analyst_Tailwind-Freight.docx");
    expect(exportFileName("Zoë O'Neil", "Lead / Principal: Data", "A&B Co.")).toBe("Zoë-ONeil_Lead-Principal-Data_AB-Co.docx");
    expect(exportFileName("", "", "")).toBe("CV.docx");
  });
});

describe("round trip", () => {
  it("the generated DOCX, converted to text, contains every heading and bullet in order", async () => {
    const cv = cvWithOther();
    const { bytes } = await build(cv, sansStyle);
    const paras = await readDocx(bytes);
    const text = paras.map((p) => p.text);
    const expected = [
      "Summary",
      cv.summary,
      "Experience",
      ...cv.experience[0].bullets,
      ...cv.experience[1].bullets,
      "Education",
      "Skills",
      "Certifications",
      ...cv.other[0].items,
    ];
    let at = -1;
    for (const e of expected) {
      const i = text.findIndex((t, n) => n > at && t === e);
      expect(i, `"${e}" after position ${at}`).toBeGreaterThan(at);
      at = i;
    }
    expect(paras.filter((p) => p.style === "Heading1").map((p) => p.text)).toEqual(["Summary", "Experience", "Education", "Skills", "Certifications"]);
  });

  it("keeps sections that are missing from section_order (nothing is dropped)", async () => {
    const cv = cvWithOther();
    const { bytes } = await build(cv, { ...sansStyle, section_order: ["experience"] });
    const headings = (await readDocx(bytes)).filter((p) => p.style === "Heading1").map((p) => p.text);
    expect(headings).toEqual(["Experience", "Summary", "Education", "Skills", "Certifications"]);
  });

  it("uses an accepted heading rename and otherwise keeps the user's label", async () => {
    const style = { ...sansStyle, heading_labels: { ...sansStyle.heading_labels, experience: "Career Journey" } };
    const kept = (await readDocx((await build(cvWithOther(), style)).bytes)).filter((p) => p.style === "Heading1").map((p) => p.text);
    expect(kept).toContain("Career Journey");
    const renamed = (await readDocx((await build(cvWithOther(), style, { experience: "Experience" })).bytes))
      .filter((p) => p.style === "Heading1")
      .map((p) => p.text);
    expect(renamed).toContain("Experience");
    expect(renamed).not.toContain("Career Journey");
  });

  it("reads the structure back: roles, bullets, skills, contact", async () => {
    const cv = cvWithOther();
    const back = structuredFromDocx(await readDocx((await build(cv, sansStyle)).bytes));
    expect(back.contact.email).toBe(cv.contact.email);
    expect(back.headline).toBe(cv.headline);
    expect(back.summary).toBe(cv.summary);
    expect(back.experience.map((r) => [r.title, r.company, r.bullets])).toEqual(cv.experience.map((r) => [r.title, r.company, r.bullets]));
    expect(back.skills).toEqual(cv.skills);
  });
});

describe("export score", () => {
  const cv = fixtureCv();
  const jdTerms = fixtureTerms();
  const checks = {
    text_extractable: { pass: true, label: "" },
    single_column: { pass: false, label: "" },
    standard_headings: { pass: true, label: "", nonstandard: [] },
    header_footer_clear: { pass: true, label: "" },
    no_tables_or_text_boxes: { pass: true, label: "" },
  };
  const base = scoreCv({ cv, pageCount: 1, parseChecks: checks, jdTerms, roleTitle: "Senior Data Analyst", spellingErrors: [] });
  const ctx = { cv, jdTerms, base, roleTitle: "Senior Data Analyst" };
  const sug = (over: Partial<Suggestion>): Suggestion => ({
    id: "x",
    type: "keyword",
    category: "keyword_coverage",
    section_ref: "/experience/0/bullets/2",
    before_text: cv.experience[0].bullets[2],
    after_text: "Ran A/B testing on routing changes with the operations team",
    evidence_quote: "split tests on routing",
    points: 7.78,
    status: "accepted",
    user_text: null,
    edited_text: null,
    rank: 1,
    term: "A/B testing",
    source: "model",
    confirmed: false,
    ...over,
  });
  const suggestions = [
    sug({ id: "k" }),
    sug({
      id: "q",
      type: "quantify",
      category: "evidence_impact",
      section_ref: "/experience/1/bullets/0",
      before_text: cv.experience[1].bullets[0],
      after_text: `Owned the stock availability report for 120 stores, cutting stock-outs by ${METRIC}`,
      user_text: "18%",
      term: "",
      rank: 2,
    }),
    sug({
      id: "s",
      type: "rewrite",
      category: "title_summary",
      section_ref: "/summary",
      before_text: cv.summary,
      after_text: "Data analyst in logistics with SQL and dbt, turning operational data into weekly reporting.",
      evidence_quote: "Northwind Logistics",
      term: "",
      rank: 3,
    }),
    // Skipped, but the template fixes the layout anyway.
    sug({ id: "f", type: "format", category: "parse_safety", section_ref: "/_format/single_column", before_text: "Multi-column layout", after_text: "Single column", points: 4, status: "skipped", term: "", rank: 4 }),
  ];

  it("recomputed score from the generated document is within 2 points of the projection", async () => {
    const prepared = prepareExport(ctx, sansStyle, suggestions);
    expect(prepared.applied.map((s) => s.id).sort()).toEqual(["f", "k", "q", "s"]);
    const doc = buildCvDocument(prepared.cv, sansStyle, { headingLabels: prepared.headingLabels });
    const bytes = new Uint8Array(await Packer.toBuffer(doc));
    const result = await rescoreExport(bytes, ctx, prepared, { pageCount: 1, spellingErrors: [] });
    expect(result.projected).toBe(prepared.projection.total);
    expect(Math.abs(result.diff)).toBeLessThanOrEqual(2);
    expect(result.defect).toBe(false);
    expect(result.score.categories.parse_safety.score).toBe(20);
    expect(result.score.total).toBeGreaterThan(base.total);
  });

  it("flags a defect when the document scores more than 2 points away from the projection", async () => {
    const prepared = prepareExport(ctx, sansStyle, suggestions);
    const doc = buildCvDocument(cv, sansStyle, {}); // edits not applied: a broken export
    const bytes = new Uint8Array(await Packer.toBuffer(doc));
    const result = await rescoreExport(bytes, ctx, prepared, { pageCount: 1, spellingErrors: [] });
    expect(result.defect).toBe(true);
  });
});
