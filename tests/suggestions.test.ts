import { describe, expect, it } from "vitest";
import { applyEdits, canAccept, effectiveText, type Suggestion } from "../src/lib/applyEdits.ts";
import { pointsFor, projectFromSuggestions } from "../supabase/functions/_shared/points.ts";
import { METRIC } from "../supabase/functions/_shared/validate.ts";
import { scoreCv } from "../supabase/functions/_shared/scoring.ts";
import { fixtureCv, fixtureTerms } from "./fixtures/suggestionContext.ts";

const cv = fixtureCv();
const jdTerms = fixtureTerms();
const base = scoreCv({ cv, pageCount: 1, parseChecks: undefined, jdTerms, roleTitle: "Senior Data Analyst", spellingErrors: [] });
const ctx = { cv, jdTerms, base, roleTitle: "Senior Data Analyst" };
const B2 = cv.experience[0].bullets[2];
const B3 = cv.experience[1].bullets[0];

function sug(over: Partial<Suggestion>): Suggestion {
  return {
    id: "s1",
    type: "keyword",
    category: "keyword_coverage",
    section_ref: "/experience/0/bullets/2",
    before_text: B2,
    after_text: "Ran A/B testing on routing changes with the operations team",
    evidence_quote: "split tests on routing",
    points: 7.78,
    status: "open",
    user_text: null,
    edited_text: null,
    rank: 1,
    term: "A/B testing",
    source: "model",
    confirmed: false,
    ...over,
  };
}

const quantify = (over: Partial<Suggestion> = {}) =>
  sug({
    id: "q",
    type: "quantify",
    category: "evidence_impact",
    section_ref: "/experience/1/bullets/0",
    before_text: B3,
    after_text: `Owned the stock availability report for 120 stores, cutting stock-outs by ${METRIC}`,
    evidence_quote: "",
    term: "",
    rank: 2,
    ...over,
  });

const unverified = (over: Partial<Suggestion> = {}) =>
  sug({
    id: "u",
    type: "unverified_keyword",
    section_ref: "/experience/0/bullets",
    before_text: "",
    after_text: "",
    evidence_quote: "",
    term: "Snowflake",
    rank: 3,
    ...over,
  });

describe("effective text and acceptance rules", () => {
  it("uses edited wording over the proposal", () => {
    expect(effectiveText(sug({ edited_text: "Ran A/B testing on routing" }))).toBe("Ran A/B testing on routing");
  });

  it("F13: Quantify needs the user to type a metric before it can be accepted", () => {
    expect(canAccept(quantify())).toBe(false);
    expect(canAccept(quantify({ user_text: "a lot" }))).toBe(false);
    expect(canAccept(quantify({ user_text: "18%" }))).toBe(true);
    expect(effectiveText(quantify({ user_text: "18%" }))).toBe("Owned the stock availability report for 120 stores, cutting stock-outs by 18%");
  });

  it("F14: Unverified keyword needs confirmation and the user's own wording naming the term", () => {
    expect(canAccept(unverified({ user_text: "Built dbt models on Snowflake" }))).toBe(false);
    expect(canAccept(unverified({ confirmed: true, user_text: "" }))).toBe(false);
    expect(canAccept(unverified({ confirmed: true, user_text: "Built dbt models on our warehouse" }))).toBe(false);
    expect(canAccept(unverified({ confirmed: true, user_text: "Built dbt models on Snowflake" }))).toBe(true);
    expect(effectiveText(unverified({ confirmed: true, user_text: "Built dbt models on Snowflake" }))).toBe("Built dbt models on Snowflake");
  });
});

describe("points", () => {
  it("keyword: the term's share of keyword coverage, 0 if the edited wording drops the term", () => {
    expect(pointsFor(sug({}), ctx)).toBeCloseTo((35 * 2) / 9, 1);
    expect(pointsFor(sug({ edited_text: "Ran split tests on routing changes" }), ctx)).toBe(0);
  });

  it("quantify: one more quantified bullet in the two most recent roles", () => {
    expect(pointsFor(quantify({ user_text: "18%" }), ctx)).toBeCloseTo(20 / 5, 1);
  });

  it("unverified: counts only once the user's text names the term", () => {
    expect(pointsFor(unverified({ confirmed: true, user_text: "Modelled data on Snowflake" }), ctx)).toBeCloseTo((35 * 1) / 9, 1);
    expect(pointsFor(unverified({ confirmed: true, user_text: "Modelled data" }), ctx)).toBe(0);
  });
});

describe("applyEdits", () => {
  it("deep-copies, replaces, appends and fills the metric, in rank order", () => {
    const accepted = [
      sug({ status: "accepted" }),
      quantify({ status: "accepted", user_text: "18%" }),
      unverified({ status: "accepted", confirmed: true, user_text: "Modelled delivery data on Snowflake" }),
    ];
    const res = applyEdits(cv, accepted);
    expect(res.cv.experience[0].bullets[2]).toBe("Ran A/B testing on routing changes with the operations team");
    expect(res.cv.experience[1].bullets[0]).toBe("Owned the stock availability report for 120 stores, cutting stock-outs by 18%");
    expect(res.cv.experience[0].bullets.at(-1)).toBe("Modelled delivery data on Snowflake");
    expect(cv.experience[0].bullets[2]).toBe(B2);
    expect(res.conflicts).toEqual([]);
  });

  it("applies the higher-ranked of two edits to the same text and flags the other", () => {
    const a = sug({ id: "a", rank: 1, status: "accepted" });
    const b = sug({ id: "b", rank: 4, status: "accepted", type: "rewrite", category: "evidence_impact", after_text: "Ran split tests on routing changes" });
    const res = applyEdits(cv, [b, a]);
    expect(res.cv.experience[0].bullets[2]).toBe(a.after_text);
    expect(res.conflicts).toEqual([{ id: "b", with: "a" }]);
  });

  it("ignores open, skipped and not-yet-acceptable suggestions", () => {
    const res = applyEdits(cv, [sug({ status: "skipped" }), quantify({ status: "accepted" })]);
    expect(res.cv).toEqual(cv);
  });
});

describe("projected score (F12)", () => {
  it("is the base score plus accepted points, capped per category, excluding conflicts", () => {
    const list = [sug({ id: "a", status: "accepted" }), quantify({ status: "open", user_text: "18%" })];
    const p1 = projectFromSuggestions(list, ctx);
    expect(p1.categories.keyword_coverage.score).toBe(Math.min(35, Math.round(base.categories.keyword_coverage.score + (35 * 2) / 9)));
    expect(p1.categories.evidence_impact.score).toBe(base.categories.evidence_impact.score);

    const conflict = [...list, sug({ id: "b", rank: 9, status: "accepted", type: "rewrite", category: "evidence_impact" })];
    expect(projectFromSuggestions(conflict, ctx)).toEqual(p1);

    expect(projectFromSuggestions([], ctx)).toEqual(base);
  });
});
