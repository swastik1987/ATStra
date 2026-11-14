import { describe, expect, it } from "vitest";
import {
  WEIGHTS,
  countInText,
  isQuantified,
  projectScore,
  roleLevelMatch,
  scoreCv,
  termFound,
  type JdTerm,
  type ScoreInput,
} from "../src/lib/scoring.ts";
import type { ParseChecks, StructuredCv } from "../supabase/functions/_shared/parseCv.ts";

function cv(over: Partial<StructuredCv> = {}): StructuredCv {
  return {
    contact: { name: "Alex Morgan", email: "alex@example.com", phone: "+44 7700 900123", location: "Leeds", links: [] },
    headline: "Senior Data Analyst",
    summary: "Data analyst in logistics with SQL, dbt and Looker experience building delivery reporting.",
    experience: [
      {
        company: "Northwind",
        title: "Senior Data Analyst",
        location: "",
        start: "Mar 2021",
        end: "Present",
        bullets: [
          "Reduced reconciliation time by 80% by rewriting the metric in dbt",
          "Built the weekly dashboard in Looker used by 40 managers",
        ],
      },
      {
        company: "Fabrikam",
        title: "Data Analyst",
        location: "",
        start: "Jun 2018",
        end: "Feb 2021",
        bullets: ["Cut report refresh from three hours to ten minutes", "Owned the stock report"],
      },
      { company: "Old Co", title: "Clerk", location: "", start: "Jan 2015", end: "May 2018", bullets: ["Increased sales by 50%"] },
    ],
    education: [{ institution: "Uni", degree: "BSc", start: "2012", end: "2015" }],
    skills: ["SQL", "Python", "dbt", "Looker"],
    other: [],
    ...over,
  };
}

const allPass = (pass = true) =>
  ({
    text_extractable: { pass, label: "" },
    single_column: { pass, label: "" },
    standard_headings: { pass, label: "", nonstandard: [] },
    header_footer_clear: { pass, label: "" },
    no_tables_or_text_boxes: { pass, label: "" },
  }) as ParseChecks["checks"];

const term = (t: string, importance: "must" | "nice" = "must", over: Partial<JdTerm> = {}): JdTerm => ({
  term: t,
  synonyms: [],
  importance,
  is_domain: false,
  jd_count: 1,
  found_in_cv: false,
  ...over,
});

function input(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    cv: cv(),
    pageCount: 1,
    parseChecks: allPass(),
    jdTerms: [term("SQL"), term("dbt"), term("logistics", "must", { is_domain: true }), term("Snowflake", "nice")],
    roleTitle: "Senior Data Analyst",
    spellingErrors: [],
    ...over,
  };
}

describe("weights", () => {
  it("live in one config object and sum to 100", () => {
    expect(WEIGHTS).toEqual({ keyword_coverage: 35, title_summary: 15, evidence_impact: 20, parse_safety: 20, hygiene: 10 });
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("term matching", () => {
  it("matches whole words and phrases, case-insensitive, with simple plurals", () => {
    expect(termFound("sql", [], "Expert SQL skills")).toBe(true);
    expect(termFound("dashboard", [], "built dashboards")).toBe(true);
    expect(termFound("SQL", [], "NoSQLite")).toBe(false);
    expect(termFound("stakeholder management", [], "strong stakeholder\nmanagement")).toBe(true);
    expect(termFound("C++", [], "Wrote C++ services")).toBe(true);
  });

  it("matches on a listed synonym", () => {
    expect(termFound("A/B testing", ["experimentation", "split testing"], "Ran experimentation programme")).toBe(true);
  });

  it("counts occurrences of the term and its synonyms without double counting", () => {
    expect(countInText("dbt", ["data build tool"], "dbt models. dbt tests. data build tool")).toBe(3);
    expect(countInText("data", ["data analysis"], "data analysis")).toBe(1);
  });
});

describe("keyword coverage (35)", () => {
  it("counts must-have terms double, matching against the CV text in code", () => {
    // found: SQL (2), dbt (2), logistics (2); missing: Snowflake (1) => 6/7
    const s = scoreCv(input());
    expect(s.categories.keyword_coverage).toMatchObject({ score: Math.round((35 * 6) / 7), max: 35 });
  });

  it("ignores the stored found_in_cv flag and recomputes from the CV", () => {
    const s = scoreCv(input({ jdTerms: [term("Snowflake", "must", { found_in_cv: true })] }));
    expect(s.categories.keyword_coverage.score).toBe(0);
  });

  it("is 0 with no JD terms", () => {
    expect(scoreCv(input({ jdTerms: [] })).categories.keyword_coverage.score).toBe(0);
  });
});

describe("title and summary fit (15)", () => {
  it("awards 5 each for role-level match, domain term in summary, top three terms in first 60 words", () => {
    const s = scoreCv(input());
    expect(s.categories.title_summary.checks).toEqual({ role_level_match: true, domain_in_summary: true, top_terms_early: true });
    expect(s.categories.title_summary.score).toBe(15);
  });

  it("fails role-level match when the level differs", () => {
    expect(roleLevelMatch("Lead Data Analyst", cv())).toBe(false);
    expect(roleLevelMatch("Data Analyst", cv())).toBe(true);
    expect(roleLevelMatch("Sr. Data Analyst", cv())).toBe(true);
    expect(roleLevelMatch("Director of Product", cv({ headline: "Product Director" }))).toBe(true);
  });

  it("fails domain and early-terms checks when the summary lacks them", () => {
    const s = scoreCv(input({ cv: cv({ summary: "Analyst who likes data.", skills: [] }) }));
    expect(s.categories.title_summary.checks).toMatchObject({ domain_in_summary: false, top_terms_early: false });
    expect(s.categories.title_summary.score).toBe(5);
  });
});

describe("evidence and impact (20)", () => {
  it("detects a number plus an outcome", () => {
    expect(isQuantified("Reduced reconciliation time by 80%")).toBe(true);
    expect(isQuantified("Cut report refresh from three hours to ten minutes")).toBe(true);
    expect(isQuantified("Built the weekly dashboard used by 40 managers")).toBe(false);
    expect(isQuantified("Improved onboarding for new starters")).toBe(false);
    expect(isQuantified("Owned the delivery report")).toBe(false);
  });

  it("uses only the two most recent roles: round(20 * quantified / total)", () => {
    // roles 0-1: 4 bullets, 2 quantified; the third role's quantified bullet is ignored
    expect(scoreCv(input()).categories.evidence_impact.score).toBe(10);
  });

  it("is 0 when there are no bullets", () => {
    expect(scoreCv(input({ cv: cv({ experience: [] }) })).categories.evidence_impact.score).toBe(0);
  });
});

describe("parse safety (20)", () => {
  it("awards 4 per passing check", () => {
    expect(scoreCv(input()).categories.parse_safety.score).toBe(20);
    const checks = allPass();
    checks.single_column.pass = false;
    checks.standard_headings.pass = false;
    expect(scoreCv(input({ parseChecks: checks })).categories.parse_safety.score).toBe(12);
    expect(scoreCv(input({ parseChecks: undefined })).categories.parse_safety.score).toBe(0);
  });
});

describe("hygiene (10)", () => {
  it("awards 2 each: length, date format, email, phone, spelling", () => {
    const s = scoreCv(input());
    expect(s.categories.hygiene.checks).toEqual({ length: true, date_format: true, email: true, phone: true, spelling: true });
    expect(s.categories.hygiene.score).toBe(10);
  });

  it("fails each check independently", () => {
    const base = cv();
    const mixed = cv({
      contact: { ...base.contact, email: "", phone: "" },
      experience: [{ ...base.experience[0], start: "03/2021" }, ...base.experience.slice(1)],
    });
    const s = scoreCv(input({ cv: mixed, pageCount: 3, spellingErrors: ["managment"] }));
    expect(s.categories.hygiene.checks).toEqual({ length: false, date_format: false, email: false, phone: false, spelling: false });
    expect(s.categories.hygiene.score).toBe(0);
  });
});

describe("total and determinism", () => {
  it("is the sum of the categories", () => {
    const s = scoreCv(input());
    const sum = Object.values(s.categories).reduce((n, c) => n + c.score, 0);
    expect(s.total).toBe(sum);
  });

  it("gives the same score for the same inputs on five runs, without mutating inputs", () => {
    const i = input();
    const frozen = JSON.stringify(i);
    const runs = Array.from({ length: 5 }, () => scoreCv(i));
    for (const r of runs) expect(r).toEqual(runs[0]);
    expect(JSON.stringify(i)).toBe(frozen);
  });
});

describe("projectScore", () => {
  it("adds accepted suggestion points, capped at each category's weight", () => {
    const base = scoreCv(input());
    const projected = projectScore(base, [
      { category: "evidence_impact", points: 4 },
      { category: "evidence_impact", points: 20 },
      { category: "keyword_coverage", points: 2 },
    ]);
    expect(projected.categories.evidence_impact.score).toBe(20);
    expect(projected.categories.keyword_coverage.score).toBe(Math.min(35, base.categories.keyword_coverage.score + 2));
    expect(projected.total).toBe(Object.values(projected.categories).reduce((n, c) => n + c.score, 0));
  });
});
