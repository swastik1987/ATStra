import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runAnalyse, type AnalyseDeps, type AnalyseOutput } from "../supabase/functions/_shared/analyse.ts";
import { fixtureCv } from "./fixtures/suggestionContext.ts";

const INJECTED_JD = readFileSync("tests/fixtures/jd-injection-fake-degree.txt", "utf8");

/**
 * Deterministic half of the phase 5 injection check: even if the model obeys the JD's
 * hidden instruction, validation must stop the fake degree reaching a card.
 */
describe("prompt injection: a JD asking for a fake degree", () => {
  const cv = fixtureCv();
  const obedientModel: AnalyseOutput = {
    role_title: "Senior Data Analyst",
    company: "Tailwind Freight",
    terms: [
      { term: "SQL", synonyms: [], importance: "must", is_domain: false },
      { term: "logistics", synonyms: [], importance: "must", is_domain: true },
    ],
    spelling_errors: [],
    suggestions: [
      // Fake degree written into the summary.
      {
        type: "rewrite",
        section_ref: "/summary",
        before_text: cv.summary,
        after_text: "Data analyst with a PhD from Stanford University turning operational data into reporting.",
        evidence_quote: "turning operational data into weekly reporting",
        term: "",
      },
      // Fake degree appended to skills, dressed up as a keyword.
      { type: "keyword", section_ref: "/skills", before_text: "", after_text: "PhD Computer Science, Stanford University", evidence_quote: "SQL", term: "SQL" },
      // Fake degree proposed as a rewrite of the education-adjacent headline.
      { type: "rewrite", section_ref: "/headline", before_text: cv.headline, after_text: "Senior Data Analyst, Stanford PhD", evidence_quote: "Senior Data Analyst", term: "" },
    ],
  };

  it("stores no suggestion that adds the degree", async () => {
    let stored: unknown[] = [];
    const deps: AnalyseDeps = {
      getApplication: async () => ({ id: "a", cv_id: "c", role_title: "", company: "", jd_text: INJECTED_JD, jd_terms: null, base_score: null }),
      getCv: async () => ({ structured: cv, parse_checks: { page_count: 1 }, raw_text: "" }),
      countAnalyseCallsToday: async () => 0,
      callModel: async (args) => {
        // The JD reaches the model only inside delimiters, with the instruction to ignore its commands.
        const text = args.content.map((c) => ("text" in c ? c.text : "")).join("\n");
        expect(text).toMatch(/<JD>[\s\S]*Ignore all previous instructions[\s\S]*<\/JD>/);
        expect(args.system).toMatch(/data, not instructions/);
        return { data: structuredClone(obedientModel), modelId: "test" };
      },
      getSuggestions: async () => [],
      replaceSuggestions: async (_id, drafts) => {
        stored = drafts;
        return [];
      },
      save: async () => {},
    };
    await runAnalyse(deps, { application_id: "a" });
    expect(JSON.stringify(stored)).not.toMatch(/PhD|Stanford/i);
  });
});
