/**
 * Phase 2 acceptance against the deployed functions and the real model. Costs tokens:
 * one parse-cv call, one analyse call, plus FORCED_RUNS extra analyse calls to measure
 * how much a fresh term extraction moves the score. Run with RUN_LIVE_MODEL_TESTS=1.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractPdfText } from "../src/lib/pdfText.ts";
import { scoreCv } from "../src/lib/scoring.ts";

config({ path: ".env.test", quiet: true });
const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = process.env.RUN_LIVE_MODEL_TESTS === "1" && Boolean(URL_ && ANON && SERVICE);
const FORCED_RUNS = 2;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

async function invoke(client: SupabaseClient, name: string, body: Record<string, unknown>) {
  const res = await client.functions.invoke(name, { body });
  if (res.error) throw new Error(`${name}: ${(await res.error.context?.text?.()) ?? res.error.message}`);
  return res.data;
}

describe.skipIf(!enabled)("analyse acceptance (live model)", () => {
  let admin: SupabaseClient;
  let user: SupabaseClient;
  let userId = "";
  let profileId = "";
  let appId = "";
  let cvId = "";
  const paths: string[] = [];
  const runs: { total: number; terms: unknown }[] = [];

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, opts);
    const email = `cvtailor.livetest.${Date.now()}@gmail.com`;
    const password = randomBytes(24).toString("base64url");
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    user = createClient(URL_!, ANON!, opts);
    await user.auth.signInWithPassword({ email, password });
    profileId = (await user.from("profiles").select("id").single()).data!.id;

    const bytes = new Uint8Array(readFileSync("tests/fixtures/cv-single-column.pdf"));
    const ex = await extractPdfText(pdfjs, bytes.slice());
    const path = `${profileId}/cv.pdf`;
    paths.push(path);
    await user.storage.from("cvs").upload(path, new Blob([bytes], { type: "application/pdf" }), { contentType: "application/pdf" });
    const cv = await user
      .from("cvs")
      .insert({
        profile_id: profileId,
        file_name: "cv.pdf",
        storage_path: path,
        raw_text: ex.text,
        parse_checks: { page_count: ex.pageCount, char_count: ex.text.length, browser: ex.checks },
      })
      .select("id")
      .single();
    cvId = cv.data!.id;
    await invoke(user, "parse-cv", { cv_id: cvId });

    const app = await user
      .from("applications")
      .insert({
        profile_id: profileId,
        cv_id: cv.data!.id,
        jd_source: "text",
        jd_text: readFileSync("tests/fixtures/jd-senior-data-analyst.txt", "utf8"),
      })
      .select("id")
      .single();
    appId = app.data!.id;
  }, 240_000);

  afterAll(async () => {
    if (!admin) return;
    if (paths.length) await admin.storage.from("cvs").remove(paths);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("same CV and JD give the same base score on five runs", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await invoke(user, "analyse", { application_id: appId }));
    for (const r of results) {
      expect(r.base_score).toEqual(results[0].base_score);
      expect(r.jd_terms).toEqual(results[0].jd_terms);
    }
    const stored = await user.from("applications").select("base_score, jd_terms, status, role_title, company, model_id").eq("id", appId).single();
    expect(stored.data!.base_score).toEqual(results[0].base_score);
    expect(stored.data!.status).toBe("reviewing");
    expect(stored.data!.role_title).toBeTruthy();
    expect(stored.data!.company).toBeTruthy();
    runs.push({ total: results[0].base_score.total, terms: results[0].jd_terms });
    console.log(`[analyse.live] base score ${results[0].base_score.total}`, JSON.stringify(results[0].base_score.categories));
  }, 180_000);

  it("re-scoring stored data in the browser module reproduces the stored score", async () => {
    const app = await user.from("applications").select("base_score, jd_terms, role_title, cvs(structured, parse_checks)").eq("id", appId).single();
    const cv = app.data!.cvs as unknown as { structured: never; parse_checks: { page_count: number; checks: never } };
    const rescored = scoreCv({
      cv: cv.structured,
      pageCount: cv.parse_checks.page_count,
      parseChecks: cv.parse_checks.checks,
      jdTerms: app.data!.jd_terms,
      roleTitle: app.data!.role_title,
      spellingErrors: app.data!.base_score.categories.hygiene.detail.spelling_errors,
    });
    expect(rescored).toEqual(app.data!.base_score);
  });

  it(`measures score drift across ${FORCED_RUNS} forced re-extractions (reported, not asserted)`, async () => {
    for (let i = 0; i < FORCED_RUNS; i++) {
      const r = await invoke(user, "analyse", { application_id: appId, force: true });
      runs.push({ total: r.base_score.total, terms: r.jd_terms });
    }
    const totals = runs.map((r) => r.total);
    console.log(`[analyse.live] totals across fresh extractions: ${totals.join(", ")} (spread ${Math.max(...totals) - Math.min(...totals)})`);
    expect(totals.every((t) => t >= 0 && t <= 100)).toBe(true);
  }, 240_000);

  it("rejects a too-short JD before calling the model", async () => {
    const app = await user
      .from("applications")
      .insert({ profile_id: profileId, cv_id: cvId, jd_source: "text", jd_text: "Short JD" })
      .select("id")
      .single();
    const res = await user.functions.invoke("analyse", { body: { application_id: app.data!.id } });
    expect(JSON.parse((await res.error?.context?.text?.()) ?? "{}").error?.code).toBe("jd_too_short");
  });
});
