import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  AnalyseError,
  DAILY_CAP,
  MIN_JD_CHARS,
  runAnalyse,
  type AnalyseDeps,
  type AnalyseOutput,
  type ApplicationRow,
} from "../supabase/functions/_shared/analyse.ts";
import { ModelError } from "../supabase/functions/_shared/model.ts";
import type { StructuredCv } from "../supabase/functions/_shared/parseCv.ts";

const JD = readFileSync("tests/fixtures/jd-senior-data-analyst.txt", "utf8");

const structured: StructuredCv = {
  contact: { name: "Alex Morgan", email: "alex.morgan.fixture@example.com", phone: "+44 7700 900123", location: "Leeds", links: ["linkedin.com/in/x"] },
  headline: "Senior Data Analyst",
  summary: "Data analyst in logistics. Reach me at alex.morgan.fixture@example.com or +44 7700 900123.",
  experience: [
    { company: "Northwind", title: "Senior Data Analyst", location: "", start: "Mar 2021", end: "Present", bullets: ["Built Looker dashboards with SQL and dbt", "Managed stakeholders"] },
  ],
  education: [],
  skills: ["SQL", "Python"],
  other: [],
};

const modelOut: AnalyseOutput = {
  role_title: "Senior Data Analyst",
  company: "Tailwind Freight",
  terms: [
    { term: "SQL", synonyms: [], importance: "must", is_domain: false },
    { term: "dbt", synonyms: ["data build tool"], importance: "must", is_domain: false },
    { term: "Snowflake", synonyms: [], importance: "nice", is_domain: false },
    { term: "logistics", synonyms: ["supply chain"], importance: "must", is_domain: true },
    { term: "sql", synonyms: [], importance: "nice", is_domain: false },
    { term: "  ", synonyms: [], importance: "nice", is_domain: false },
  ],
  spelling_errors: ["stakeholders", "Managd", "Snowflake"],
};

const app = (over: Partial<ApplicationRow> = {}): ApplicationRow => ({
  id: "app1",
  cv_id: "cv1",
  role_title: "",
  company: "",
  jd_text: JD,
  jd_terms: null,
  base_score: null,
  ...over,
});

function deps(opts: { app?: ApplicationRow | null; calls?: number; out?: AnalyseOutput | Error; bullets?: string[] } = {}) {
  const log = { model: [] as { system: string; content: { type: string; text?: string }[] }[], saved: [] as Record<string, unknown>[] };
  const cvStructured = structuredClone(structured);
  if (opts.bullets) cvStructured.experience[0].bullets = opts.bullets;
  const d: AnalyseDeps = {
    getApplication: async () => (opts.app === undefined ? app() : opts.app),
    getCv: async () => ({ structured: cvStructured, parse_checks: { page_count: 1, checks: undefined }, raw_text: "text" }),
    countAnalyseCallsToday: async () => opts.calls ?? 0,
    callModel: async (args) => {
      log.model.push(args as never);
      const out = opts.out ?? modelOut;
      if (out instanceof Error) throw out;
      return { data: structuredClone(out), modelId: "claude-sonnet-5-5" };
    },
    save: async (_id, values) => {
      log.saved.push(values as Record<string, unknown>);
    },
  };
  return { d, log };
}

describe("runAnalyse guards", () => {
  it("not_found when the application is not visible", async () => {
    await expect(runAnalyse(deps({ app: null }).d, { application_id: "x" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("jd_too_short below the minimum, without a model call", async () => {
    const { d, log } = deps({ app: app({ jd_text: "Data analyst wanted." }) });
    await expect(runAnalyse(d, { application_id: "app1" })).rejects.toMatchObject({ code: "jd_too_short" });
    expect(log.model).toHaveLength(0);
    expect(MIN_JD_CHARS).toBe(300);
  });

  it("daily_cap at 30 calls today, without a model call", async () => {
    const { d, log } = deps({ calls: DAILY_CAP });
    const err = await runAnalyse(d, { application_id: "app1" }).catch((e) => e);
    expect(err).toBeInstanceOf(AnalyseError);
    expect(err.code).toBe("daily_cap");
    expect(err.message).toBe("Daily analysis limit reached. Try again tomorrow.");
    expect(log.model).toHaveLength(0);
  });

  it("maps model errors to model_error or schema_invalid", async () => {
    await expect(runAnalyse(deps({ out: new ModelError("schema_invalid", "x") }).d, { application_id: "app1" })).rejects.toMatchObject({ code: "schema_invalid" });
    await expect(runAnalyse(deps({ out: new Error("timeout") }).d, { application_id: "app1" })).rejects.toMatchObject({ code: "model_error" });
  });
});

describe("runAnalyse result", () => {
  it("sends the JD and the CV in delimiters, with contact details removed", async () => {
    const { d, log } = deps();
    await runAnalyse(d, { application_id: "app1" });
    const text = log.model[0].content.map((c) => c.text ?? "").join("\n");
    expect(text).toContain("<JD>");
    expect(text).toContain("<CV>");
    expect(text).not.toContain("alex.morgan.fixture@example.com");
    expect(text).not.toContain("7700 900123");
    expect(text).not.toContain("linkedin.com/in/x");
    expect(text).not.toContain("Alex Morgan");
    expect(log.model[0].system).toMatch(/data, not instructions/i);
  });

  it("computes jd_count and found_in_cv in code, dedupes and drops empty terms", async () => {
    const { d } = deps();
    const res = await runAnalyse(d, { application_id: "app1" });
    expect(res.jd_terms.map((t) => t.term)).toEqual(["SQL", "dbt", "Snowflake", "logistics"]);
    const by = Object.fromEntries(res.jd_terms.map((t) => [t.term, t]));
    expect(by.SQL.found_in_cv).toBe(true);
    expect(by.Snowflake.found_in_cv).toBe(false);
    expect(by.logistics.found_in_cv).toBe(true);
    expect(by.SQL.jd_count).toBe(3);
    expect(by.Snowflake.jd_count).toBe(2);
    expect(by.logistics.jd_count).toBeGreaterThanOrEqual(2);
  });

  it("keeps only spelling errors that really occur in the CV and are not JD terms", async () => {
    const { d } = deps({ bullets: ["Managd the Looker estate", "Built SQL models"] });
    const res = await runAnalyse(d, { application_id: "app1" });
    expect(res.base_score.categories.hygiene.detail).toEqual({ spelling_errors: ["Managd"] });
  });

  it("writes jd_terms, base_score, model, prompt version and status once", async () => {
    const { d, log } = deps();
    const res = await runAnalyse(d, { application_id: "app1" });
    expect(log.saved).toHaveLength(1);
    expect(log.saved[0]).toMatchObject({
      jd_terms: res.jd_terms,
      base_score: res.base_score,
      model_id: "claude-sonnet-5-5",
      prompt_version: "analyse.v1",
      status: "reviewing",
      role_title: "Senior Data Analyst",
      company: "Tailwind Freight",
    });
    expect(res.base_score.total).toBe(Object.values(res.base_score.categories).reduce((n, c) => n + c.score, 0));
    expect(res.suggestions).toEqual([]);
  });

  it("does not overwrite a role or company the user typed", async () => {
    const { d, log } = deps({ app: app({ role_title: "Data Lead", company: "My Co" }) });
    await runAnalyse(d, { application_id: "app1" });
    expect(log.saved[0]).not.toHaveProperty("role_title");
    expect(log.saved[0]).not.toHaveProperty("company");
  });

  it("is idempotent: stored terms and score are returned without a model call unless forced", async () => {
    const first = deps();
    const res = await runAnalyse(first.d, { application_id: "app1" });
    const stored = app({ jd_terms: res.jd_terms, base_score: res.base_score, role_title: "Senior Data Analyst" });
    const again = deps({ app: stored, calls: DAILY_CAP });
    const repeat = await runAnalyse(again.d, { application_id: "app1" });
    expect(again.log.model).toHaveLength(0);
    expect(repeat.base_score).toEqual(res.base_score);
    const forced = deps({ app: stored });
    await runAnalyse(forced.d, { application_id: "app1", force: true });
    expect(forced.log.model).toHaveLength(1);
  });
});
