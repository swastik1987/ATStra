import { describe, expect, it } from "vitest";
import { METRIC, MAX_SUGGESTIONS, validateSuggestions, type ModelSuggestion } from "../supabase/functions/_shared/validate.ts";
import { scoreCv } from "../supabase/functions/_shared/scoring.ts";
import { fixtureCv, fixtureTerms } from "./fixtures/suggestionContext.ts";

const cv = fixtureCv();
const jdTerms = fixtureTerms();
const base = scoreCv({ cv, pageCount: 1, parseChecks: undefined, jdTerms, roleTitle: "Senior Data Analyst", spellingErrors: [] });
const ctx = { cv, jdTerms, base, roleTitle: "Senior Data Analyst" };

const B0 = cv.experience[0].bullets[0];
const B2 = cv.experience[0].bullets[2];
const B3 = cv.experience[1].bullets[0];

function s(over: Partial<ModelSuggestion>): ModelSuggestion {
  return { type: "rewrite", section_ref: "/experience/0/bullets/0", before_text: B0, after_text: B0, evidence_quote: B0, term: "", ...over };
}

describe("phase 3 acceptance: invented number, invented employer, false evidence quote", () => {
  const fixture: ModelSuggestion[] = [
    // 1. Invented number: 35% appears nowhere in the CV.
    s({
      section_ref: "/experience/1/bullets/0",
      before_text: B3,
      after_text: "Owned stock availability for 120 stores, cutting stock-outs 35%",
      evidence_quote: "stock availability report for 120 stores",
    }),
    // 2. Invented employer: Contoso is not in the CV and is not a JD term.
    s({
      section_ref: "/experience/0/bullets/0",
      after_text: "Built the delivery dashboard in Looker for Contoso and 40 regional managers",
      evidence_quote: "delivery performance dashboard in Looker",
    }),
    // 3. False evidence quote: not a substring of the CV.
    s({
      type: "keyword",
      section_ref: "/experience/0/bullets/2",
      before_text: B2,
      after_text: "Ran A/B testing on routing changes with the operations team",
      evidence_quote: "Led the company-wide experimentation programme",
      term: "A/B testing",
    }),
  ];

  const report = validateSuggestions(fixture, ctx);

  it("converts the invented number to Quantify with the number removed", () => {
    const q = report.kept.find((k) => k.section_ref === "/experience/1/bullets/0");
    expect(q?.type).toBe("quantify");
    expect(q?.category).toBe("evidence_impact");
    expect(q?.after_text).not.toContain("35");
    expect(q?.after_text).toContain(METRIC);
    expect(report.converted).toContainEqual(expect.objectContaining({ to: "quantify", reason: "number_not_in_cv" }));
  });

  it("drops the invented employer", () => {
    expect(report.kept.find((k) => k.after_text.includes("Contoso"))).toBeUndefined();
    expect(report.dropped).toContainEqual(expect.objectContaining({ reason: "new_entity" }));
  });

  it("drops the false evidence quote", () => {
    expect(report.kept.find((k) => k.section_ref === "/experience/0/bullets/2")).toBeUndefined();
    expect(report.dropped).toContainEqual(expect.objectContaining({ reason: "evidence_not_in_cv" }));
  });

  it("keeps nothing that adds text absent from the CV", () => {
    for (const k of report.kept) {
      expect(k.after_text).not.toMatch(/35|Contoso|experimentation programme/);
    }
  });
});

describe("evidence check", () => {
  it("accepts a quote that matches after whitespace and case normalisation", () => {
    const r = validateSuggestions(
      [s({ type: "keyword", section_ref: "/experience/0/bullets/2", before_text: B2, after_text: "Ran A/B testing (split tests) on routing changes with the operations team", evidence_quote: "  RAN SPLIT\n tests on routing  ", term: "A/B testing" })],
      ctx,
    );
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0].type).toBe("keyword");
  });

  it("requires a quote for rewrite and keyword", () => {
    const r = validateSuggestions([s({ evidence_quote: "" })], ctx);
    expect(r.kept).toHaveLength(0);
    expect(r.dropped[0].reason).toBe("evidence_not_in_cv");
  });
});

describe("entity check and JD terms", () => {
  it("keeps a Keyword suggestion whose evidence shows the term in other words", () => {
    const r = validateSuggestions(
      [s({ type: "keyword", section_ref: "/experience/0/bullets/2", before_text: B2, after_text: "Ran A/B testing on routing changes with the operations team", evidence_quote: "Ran split tests on routing changes", term: "A/B testing" })],
      ctx,
    );
    expect(r.kept[0]).toMatchObject({ type: "keyword", term: "A/B testing", category: "keyword_coverage" });
    expect(r.kept[0].points).toBeGreaterThan(0);
  });

  it("drops a Keyword edit whose wording misses the exact JD term (it would add nothing)", () => {
    const r = validateSuggestions(
      [s({ type: "keyword", section_ref: "/experience/0/bullets/2", before_text: B2, after_text: "Ran A/B tests on routing changes with the operations team", evidence_quote: "split tests on routing", term: "A/B testing" })],
      ctx,
    );
    expect(r.kept).toHaveLength(0);
    expect(r.dropped[0].reason).toBe("term_not_in_text");
  });

  it("converts a JD term the CV does not support into Unverified keyword", () => {
    const r = validateSuggestions(
      [s({ after_text: "Built the weekly delivery performance dashboard in Looker on Snowflake for 40 regional managers", evidence_quote: "weekly delivery performance dashboard" })],
      ctx,
    );
    expect(r.kept[0]).toMatchObject({ type: "unverified_keyword", term: "Snowflake", category: "keyword_coverage" });
    expect(r.converted[0]).toMatchObject({ to: "unverified_keyword", reason: "jd_term_not_in_cv" });
  });

  it("drops a new capitalised name that is not a JD term, but ignores the sentence-initial word", () => {
    const keep = validateSuggestions([s({ after_text: "Designed the weekly delivery performance dashboard in Looker used by 40 regional managers" })], ctx);
    expect(keep.kept).toHaveLength(1);
    const drop = validateSuggestions([s({ after_text: "Built the weekly delivery dashboard in Tableau used by 40 regional managers" })], ctx);
    expect(drop.kept).toHaveLength(0);
  });

  it("drops a new month name (a date absent from the CV)", () => {
    const r = validateSuggestions([s({ after_text: "Built the weekly delivery dashboard in Looker in January for 40 regional managers" })], ctx);
    expect(r.kept).toHaveLength(0);
  });
});

describe("length, target and cap", () => {
  it("drops after_text longer than 1.3 times before_text", () => {
    const r = validateSuggestions([s({ after_text: `${B0} and presented it monthly to every regional and national leader` })], ctx);
    expect(r.dropped[0].reason).toBe("too_long");
  });

  it("drops a suggestion whose before_text does not match the CV at section_ref", () => {
    const r = validateSuggestions([s({ section_ref: "/experience/0/bullets/1" })], ctx);
    expect(r.dropped[0].reason).toBe("target_mismatch");
    const bad = validateSuggestions([s({ section_ref: "/experience/9/bullets/0" })], ctx);
    expect(bad.dropped[0].reason).toBe("target_mismatch");
  });

  it("requires exactly one [metric] placeholder in a model Quantify suggestion", () => {
    const q = (after: string) =>
      validateSuggestions([s({ type: "quantify", section_ref: "/experience/1/bullets/0", before_text: B3, after_text: after, evidence_quote: "" })], ctx);
    const ok = q(`Owned the stock availability report for 120 stores, cutting ${METRIC}`);
    expect(ok.kept[0]).toMatchObject({ type: "quantify", category: "evidence_impact" });
    expect(ok.kept[0].points).toBeGreaterThan(0);
    expect(q(B3).dropped[0].reason).toBe("metric_placeholder");
    expect(q(`Cut ${METRIC} and ${METRIC} from the stock report for 120 stores`).dropped[0].reason).toBe("metric_placeholder");
  });

  it(`keeps at most ${MAX_SUGGESTIONS}, ranked by points`, () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      s({ section_ref: "/experience/0/bullets/0", after_text: `Built the weekly delivery performance dashboard in Looker used by 40 regional managers${" ".repeat(i % 3)}` }),
    );
    const extra = s({ type: "keyword", section_ref: "/experience/0/bullets/2", before_text: B2, after_text: "Ran A/B testing on routing changes with the operations team", evidence_quote: "split tests on routing", term: "A/B testing" });
    const r = validateSuggestions([...many, extra], ctx);
    expect(r.kept.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
    expect(r.kept[0].term).toBe("A/B testing");
    expect(r.kept.map((k) => k.rank)).toEqual(r.kept.map((_, i) => i + 1));
    for (let i = 1; i < r.kept.length; i++) expect(r.kept[i - 1].points).toBeGreaterThanOrEqual(r.kept[i].points);
  });
});
