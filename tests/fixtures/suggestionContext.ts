// Shared synthetic context for suggestion tests. Not a real CV.
import type { StructuredCv } from "../../supabase/functions/_shared/parseCv.ts";
import type { JdTerm } from "../../supabase/functions/_shared/scoring.ts";

export function fixtureCv(): StructuredCv {
  return {
    contact: { name: "Alex Morgan", email: "alex@example.com", phone: "+44 7700 900123", location: "Leeds", links: [] },
    headline: "Senior Data Analyst",
    summary: "Data analyst with eight years of experience turning operational data into weekly reporting.",
    experience: [
      {
        company: "Northwind Logistics",
        title: "Senior Data Analyst",
        location: "Leeds",
        start: "Mar 2021",
        end: "Present",
        bullets: [
          "Built the weekly delivery performance dashboard in Looker used by 40 regional managers",
          "Rewrote the on-time delivery metric in dbt, cutting monthly reconciliation from three days to four hours",
          "Ran split tests on routing changes with the operations team",
        ],
      },
      {
        company: "Fabrikam Retail",
        title: "Data Analyst",
        location: "Manchester",
        start: "Jun 2018",
        end: "Feb 2021",
        bullets: ["Owned the stock availability report for 120 stores", "Automated supplier scorecards in Python"],
      },
    ],
    education: [{ institution: "University of Sheffield", degree: "BSc Mathematics", start: "2013", end: "2016" }],
    skills: ["SQL", "Python", "dbt", "Looker"],
    other: [],
  };
}

const t = (term: string, importance: "must" | "nice", synonyms: string[] = [], over: Partial<JdTerm> = {}): JdTerm => ({
  term,
  synonyms,
  importance,
  is_domain: false,
  jd_count: 2,
  found_in_cv: false,
  ...over,
});

export function fixtureTerms(): JdTerm[] {
  return [
    t("SQL", "must", [], { found_in_cv: true }),
    // "split tests" is deliberately not a synonym: the CV says it, so a Keyword suggestion has work to do.
    t("A/B testing", "must", ["experimentation"]),
    t("Snowflake", "nice"),
    t("stakeholder management", "must", ["stakeholders"]),
    t("logistics", "must", [], { is_domain: true, found_in_cv: true }),
  ];
}
