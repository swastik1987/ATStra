/**
 * Integration tests against the real Supabase project.
 * Needs .env.test (see .env.test.example). Skipped, with a warning, when it is missing.
 * Creates two throwaway users, checks isolation, then deletes everything it created.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomBytes, randomUUID } from "node:crypto";

config({ path: ".env.test", quiet: true });
const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(URL_ && ANON && SERVICE);
if (!enabled) console.warn("[rls.test] .env.test not filled in: database tests skipped.");

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

const pdfBlob = () => new Blob(["%PDF-1.4 synthetic"], { type: "application/pdf" });

type TestUser ={ id: string; email: string; client: SupabaseClient; profileId: string };

async function makeUser(admin: SupabaseClient, tag: string): Promise<TestUser> {
  const email = `cvtailor.rlstest.${tag}.${Date.now()}@gmail.com`;
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Test ${tag.toUpperCase()}` },
  });
  if (error) throw error;
  const client = createClient(URL_!, ANON!, opts);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  const { data: profile, error: pErr } = await client.from("profiles").select("id").single();
  if (pErr) throw pErr;
  return { id: data.user.id, email, client, profileId: profile.id };
}

describe.skipIf(!enabled)("auth and row-level security", () => {
  let admin: SupabaseClient;
  let a: TestUser;
  let b: TestUser;
  const ids: Record<string, string> = {};
  const cvPath = () => `${a.profileId}/rls-test.pdf`;

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, opts);
    a = await makeUser(admin, "a");
    b = await makeUser(admin, "b");

    const cv = await a.client
      .from("cvs")
      .insert({ profile_id: a.profileId, file_name: "cv.pdf", storage_path: cvPath(), raw_text: "synthetic", is_master: true })
      .select("id")
      .single();
    if (cv.error) throw cv.error;
    ids.cv = cv.data.id;

    const app = await a.client
      .from("applications")
      .insert({ profile_id: a.profileId, cv_id: ids.cv, role_title: "Analyst", company: "Acme", jd_source: "text", jd_text: "synthetic jd" })
      .select("id")
      .single();
    if (app.error) throw app.error;
    ids.app = app.data.id;

    const sug = await a.client
      .from("suggestions")
      .insert({ application_id: ids.app, type: "rewrite", category: "keyword_coverage", section_ref: "/summary", points: 2, rank: 1 })
      .select("id")
      .single();
    if (sug.error) throw sug.error;
    ids.suggestion = sug.data.id;

    const exp = await a.client
      .from("exports")
      .insert({ application_id: ids.app, storage_path: `${a.profileId}/x.docx` })
      .select("id")
      .single();
    if (exp.error) throw exp.error;
    ids.export = exp.data.id;

    const log = await a.client.from("usage_log").insert({
      user_id: a.id,
      function_name: "test",
      model_id: "test-model",
      input_tokens: 1,
      output_tokens: 1,
      prompt_version: "t",
    });
    if (log.error) throw log.error;

    const up = await a.client.storage.from("cvs").upload(cvPath(), pdfBlob(), { contentType: "application/pdf" });
    if (up.error) throw up.error;
  });

  afterAll(async () => {
    if (!admin) return;
    if (a) await admin.storage.from("cvs").remove([cvPath()]);
    for (const u of [a, b]) if (u) await admin.auth.admin.deleteUser(u.id);
  });

  it("creates exactly one profile per login, named from the account", async () => {
    const { data } = await a.client.from("profiles").select("display_name");
    expect(data).toEqual([{ display_name: "Test A" }]);
  });

  it("rejects sign-up for a non-Gmail email", async () => {
    const anon = createClient(URL_!, ANON!, opts);
    const { data, error } = await anon.auth.signUp({
      email: `cvtailor.rlstest.${randomUUID()}@example.com`,
      password: randomBytes(24).toString("base64url"),
    });
    expect(error?.message ?? "").toMatch(/gmail/i);
    expect(data.user).toBeNull();
  });

  it("the owner can read their own rows", async () => {
    for (const t of ["cvs", "applications", "suggestions", "exports", "usage_log"]) {
      const { data, error } = await a.client.from(t).select("id");
      expect(error, t).toBeNull();
      expect(data!.length, t).toBeGreaterThan(0);
    }
  });

  it("a second user reads none of the first user's rows", async () => {
    for (const t of ["profiles", "cvs", "applications", "suggestions", "exports", "usage_log"]) {
      const { data, error } = await b.client.from(t).select("*");
      expect(error, t).toBeNull();
      const leaked = (data ?? []).filter((r: Record<string, unknown>) =>
        [a.profileId, a.id, ids.cv, ids.app, ids.suggestion, ids.export].includes(String(r.id ?? "")) ||
        r.profile_id === a.profileId || r.user_id === a.id || r.application_id === ids.app,
      );
      expect(leaked, t).toEqual([]);
    }
  });

  it("a second user cannot change or delete the first user's rows", async () => {
    const upd = await b.client.from("applications").update({ company: "Hacked" }).eq("id", ids.app).select();
    expect(upd.data ?? []).toEqual([]);
    const del = await b.client.from("cvs").delete().eq("id", ids.cv).select();
    expect(del.data ?? []).toEqual([]);
    const check = await a.client.from("applications").select("company").eq("id", ids.app).single();
    expect(check.data?.company).toBe("Acme");
  });

  it("a second user cannot insert rows into the first user's profile", async () => {
    const ins = await b.client.from("applications").insert({ profile_id: a.profileId, role_title: "x", company: "x", jd_source: "text" });
    expect(ins.error).not.toBeNull();
    const sug = await b.client.from("suggestions").insert({ application_id: ids.app, type: "rewrite", category: "hygiene", section_ref: "/x", points: 1, rank: 1 });
    expect(sug.error).not.toBeNull();
    const log = await b.client.from("usage_log").insert({ user_id: a.id, function_name: "x", model_id: "x", input_tokens: 0, output_tokens: 0, prompt_version: "x" });
    expect(log.error).not.toBeNull();
  });

  it("storage: a second user cannot read or write the first user's files", async () => {
    const own = await a.client.storage.from("cvs").download(cvPath());
    expect(own.error).toBeNull();
    const read = await b.client.storage.from("cvs").download(cvPath());
    expect(read.error).not.toBeNull();
    // A valid PDF, so a rejection here can only come from the ownership policy.
    const write = await b.client.storage.from("cvs").upload(`${a.profileId}/evil.pdf`, pdfBlob(), { contentType: "application/pdf" });
    expect(write.error).not.toBeNull();
    expect(write.error?.message ?? "").not.toMatch(/mime/i);
    // B can write to their own folder, proving the rejection above is about ownership.
    const ownWrite = await b.client.storage.from("cvs").upload(`${b.profileId}/own.pdf`, pdfBlob(), { contentType: "application/pdf" });
    expect(ownWrite.error).toBeNull();
    await admin.storage.from("cvs").remove([`${b.profileId}/own.pdf`]);
    const signed = await b.client.storage.from("cvs").createSignedUrl(cvPath(), 60);
    expect(signed.error).not.toBeNull();
  });

  it("set_master_cv swaps the master atomically, and only for the owner", async () => {
    const second = await a.client
      .from("cvs")
      .insert({ profile_id: a.profileId, file_name: "new.pdf", storage_path: `${a.profileId}/new.pdf`, is_master: false })
      .select("id")
      .single();
    expect(second.error).toBeNull();
    const denied = await b.client.rpc("set_master_cv", { p_cv_id: second.data!.id });
    expect(denied.error).not.toBeNull();
    const ok = await a.client.rpc("set_master_cv", { p_cv_id: second.data!.id });
    expect(ok.error).toBeNull();
    const masters = await a.client.from("cvs").select("id").eq("is_master", true);
    expect(masters.data).toEqual([{ id: second.data!.id }]);
    // Restore the original master for the next test.
    await a.client.rpc("set_master_cv", { p_cv_id: ids.cv });
  });

  it("only one master CV per profile", async () => {
    const dup = await a.client.from("cvs").insert({ profile_id: a.profileId, file_name: "b.pdf", storage_path: `${a.profileId}/b.pdf`, is_master: true });
    expect(dup.error).not.toBeNull();
  });
});
