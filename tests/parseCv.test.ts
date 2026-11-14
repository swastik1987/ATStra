import { describe, expect, it } from "vitest";
import {
  ParseCvError,
  bulletsByRole,
  buildParseChecks,
  checkTranscription,
  normaliseStyle,
  runParseCv,
  type CvRow,
  type ParseCvDeps,
  type ParseOutput,
} from "../supabase/functions/_shared/parseCv.ts";
import { ModelError } from "../supabase/functions/_shared/model.ts";

const RAW = `Alex Morgan
Senior Data Analyst
Summary
Data analyst with eight years of experience.
Experience
Senior Data Analyst, Northwind Logistics Mar 2021 - Present
• Built the weekly delivery dashboard in Looker used by 40
regional managers
Education
BSc Mathematics, University of Sheffield 2013 - 2016
Career Journey
Skills
SQL, Python`.padEnd(260, " ");

function output(over: Partial<ParseOutput> = {}): ParseOutput {
  return {
    structured: {
      contact: { name: "Alex Morgan", email: "", phone: "", location: "", links: [] },
      headline: "Senior Data Analyst",
      summary: "Data analyst with eight years of experience.",
      experience: [
        {
          company: "Northwind Logistics",
          title: "Senior Data Analyst",
          location: "",
          start: "Mar 2021",
          end: "Present",
          bullets: ["Built the weekly delivery dashboard in Looker used by 40 regional managers"],
        },
      ],
      education: [{ institution: "University of Sheffield", degree: "BSc Mathematics", start: "2013", end: "2016" }],
      skills: ["SQL", "Python"],
      other: [],
    },
    sections: [
      { key: "summary", label: "Summary" },
      { key: "experience", label: "Experience" },
      { key: "education", label: "Education" },
      { key: "skills", label: "Skills" },
    ],
    style: { font_class: "sans", accent_color: "#1F3A5F", name_align: "left", bullet_style: "disc" },
    layout: { source_columns: 1, has_tables: false, has_text_boxes: false },
    ...over,
  };
}

function deps(row: CvRow | null, out: ParseOutput | Error = output()) {
  const calls = { model: 0, saved: [] as unknown[], downloaded: [] as string[] };
  const d: ParseCvDeps = {
    getCv: async () => row,
    downloadPdf: async (p) => {
      calls.downloaded.push(p);
      return new TextEncoder().encode("%PDF-1.4 synthetic");
    },
    callModel: async (args) => {
      calls.model++;
      expect(args.content[0]).toMatchObject({ type: "document", source: { media_type: "application/pdf" } });
      if (out instanceof Error) throw out;
      return out;
    },
    save: async (_id, values) => {
      calls.saved.push(values);
    },
  };
  return { d, calls };
}

const baseRow: CvRow = {
  id: "cv1",
  storage_path: "p1/cv.pdf",
  raw_text: RAW,
  structured: null,
  style: null,
  parse_checks: { page_count: 1, char_count: 260, browser: { text_extractable: true, single_column: true, header_footer_clear: true } },
};

describe("runParseCv", () => {
  it("returns cv_not_found when the row is not visible", async () => {
    const { d } = deps(null);
    await expect(runParseCv(d, { cv_id: "x" })).rejects.toMatchObject({ code: "cv_not_found" });
  });

  it("returns scanned_pdf without calling the model when text is under 200 characters", async () => {
    const { d, calls } = deps({ ...baseRow, raw_text: "short" });
    await expect(runParseCv(d, { cv_id: "cv1" })).rejects.toMatchObject({ code: "scanned_pdf" });
    expect(calls.model).toBe(0);
  });

  it("parses, normalises style, builds checks and saves", async () => {
    const { d, calls } = deps(baseRow);
    const res = await runParseCv(d, { cv_id: "cv1" });
    expect(calls.downloaded).toEqual(["p1/cv.pdf"]);
    expect(calls.saved).toHaveLength(1);
    expect(res.style.section_order).toEqual(["summary", "experience", "education", "skills"]);
    expect(res.style.heading_labels).toEqual({ summary: "Summary", experience: "Experience", education: "Education", skills: "Skills" });
    expect(res.style.source_columns).toBe(1);
    expect(res.parse_checks.checks.single_column.pass).toBe(true);
    expect(res.parse_checks.transcription.unmatched).toEqual([]);
  });

  it("is idempotent: an already parsed CV is returned without a model call", async () => {
    const { d, calls } = deps({ ...baseRow, structured: output().structured, style: {}, parse_checks: { checks: {} } });
    await runParseCv(d, { cv_id: "cv1" });
    expect(calls.model).toBe(0);
    await runParseCv(d, { cv_id: "cv1", force: true });
    expect(calls.model).toBe(1);
  });

  it("passes model errors through with their code", async () => {
    const { d } = deps(baseRow, new ModelError("schema_invalid", "bad"));
    await expect(runParseCv(d, { cv_id: "cv1" })).rejects.toMatchObject({ code: "schema_invalid" });
    const e2 = deps(baseRow, new Error("network"));
    const err = await runParseCv(e2.d, { cv_id: "cv1" }).catch((e) => e);
    expect(err).toBeInstanceOf(ParseCvError);
    expect(err.code).toBe("model_error");
  });
});

describe("checkTranscription", () => {
  it("accepts text that appears in the extracted PDF text, even across line breaks", () => {
    expect(checkTranscription(output().structured, RAW)).toEqual([]);
  });

  it("flags a bullet the model invented or rewrote", () => {
    const s = output().structured;
    s.experience[0].bullets.push("Increased revenue by 300% through machine learning initiatives");
    const flagged = checkTranscription(s, RAW);
    expect(flagged).toEqual([{ path: "/experience/0/bullets/1", text: "Increased revenue by 300% through machine learning initiatives" }]);
  });
});

describe("normaliseStyle", () => {
  it("maps sections to order and labels, keeping other headings", () => {
    const style = normaliseStyle(
      output({
        sections: [
          { key: "experience", label: "Career Journey" },
          { key: "other", label: "Certifications" },
          { key: "skills", label: "" },
        ],
      }),
    );
    expect(style.section_order).toEqual(["experience", "other:Certifications", "skills"]);
    expect(style.heading_labels).toEqual({ experience: "Career Journey", "other:Certifications": "Certifications", skills: "Skills" });
  });

  it("rejects an invalid accent colour and clamps columns", () => {
    const style = normaliseStyle(
      output({
        style: { font_class: "serif", accent_color: "navy", name_align: "center", bullet_style: "dash" },
        layout: { source_columns: 0, has_tables: false, has_text_boxes: false },
      }),
    );
    expect(style.accent_color).toBeNull();
    expect(style.font_class).toBe("serif");
    expect(style.source_columns).toBe(1);
  });
});

describe("buildParseChecks", () => {
  it("fails single column if either the browser or the model sees columns", () => {
    const style = normaliseStyle(output({ layout: { source_columns: 2, has_tables: false, has_text_boxes: false } }));
    const checks = buildParseChecks(baseRow.parse_checks, output({ layout: { source_columns: 2, has_tables: false, has_text_boxes: false } }), style, []);
    expect(checks.checks.single_column.pass).toBe(false);
  });

  it("fails standard headings on a non-standard label and names it", () => {
    const out = output({ sections: [{ key: "experience", label: "Career Journey" }] });
    const checks = buildParseChecks(baseRow.parse_checks, out, normaliseStyle(out), []);
    expect(checks.checks.standard_headings).toMatchObject({ pass: false, nonstandard: ["Career Journey"] });
  });

  it("fails the tables check when the model reports tables or text boxes", () => {
    const out = output({ layout: { source_columns: 1, has_tables: true, has_text_boxes: false } });
    const checks = buildParseChecks(baseRow.parse_checks, out, normaliseStyle(out), []);
    expect(checks.checks.no_tables_or_text_boxes.pass).toBe(false);
  });
});

describe("bulletsByRole", () => {
  it("lists normalised bullets per role in order", () => {
    expect(bulletsByRole(output().structured)).toEqual([
      { role: "senior data analyst | northwind logistics", bullets: ["built the weekly delivery dashboard in looker used by 40 regional managers"] },
    ]);
  });
});
