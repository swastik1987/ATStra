/**
 * Live database tests for phase 5 (no model calls): outcome changes persist with a timestamp,
 * and deleting an application or a CV removes its rows and its files. Needs .env.test.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { deleteApplication, deleteCv } from "../src/lib/deleteFlows.ts";

config({ path: ".env.test", quiet: true });
const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(URL_ && ANON && SERVICE);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe.skipIf(!enabled)("outcomes and delete flows (live database)", () => {
  let admin: SupabaseClient;
  let user: SupabaseClient;
  let userId = "";
  let profileId = "";

  async function seed() {
    const cvPath = `${profileId}/${Date.now()}-cv.pdf`;
    await user.storage.from("cvs").upload(cvPath, new Blob(["%PDF-1.4 synthetic"], { type: "application/pdf" }), { contentType: "application/pdf" });
    const cv = await user.from("cvs").insert({ profile_id: profileId, file_name: "cv.pdf", storage_path: cvPath }).select("id").single();
    const app = await user
      .from("applications")
      .insert({ profile_id: profileId, cv_id: cv.data!.id, jd_source: "text", jd_text: "synthetic", role_title: "Analyst", company: "Acme" })
      .select("id")
      .single();
    await user.from("suggestions").insert({ application_id: app.data!.id, type: "rewrite", category: "hygiene", section_ref: "/summary", points: 1, rank: 1 });
    const exportPath = `${profileId}/${app.data!.id}/${Date.now()}-x.docx`;
    await user.storage.from("exports").upload(exportPath, new Blob(["PK"], { type: DOCX }), { contentType: DOCX });
    await user.from("exports").insert({ application_id: app.data!.id, storage_path: exportPath });
    return { cvId: cv.data!.id, cvPath, appId: app.data!.id, exportPath };
  }

  async function fileExists(bucket: string, path: string) {
    const dir = path.split("/").slice(0, -1).join("/");
    const { data } = await admin.storage.from(bucket).list(dir, { limit: 100 });
    return (data ?? []).some((f) => f.name === path.split("/").pop());
  }

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, opts);
    const email = `cvtailor.rlstest.p5.${Date.now()}@gmail.com`;
    const password = randomBytes(24).toString("base64url");
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    user = createClient(URL_!, ANON!, opts);
    await user.auth.signInWithPassword({ email, password });
    profileId = (await user.from("profiles").select("id").single()).data!.id;
  });

  afterAll(async () => {
    if (!admin || !profileId) return;
    for (const bucket of ["cvs", "exports"]) {
      const { data: top } = await admin.storage.from(bucket).list(profileId, { limit: 100 });
      const paths: string[] = [];
      for (const f of top ?? []) {
        if (f.id) paths.push(`${profileId}/${f.name}`);
        else (await admin.storage.from(bucket).list(`${profileId}/${f.name}`)).data?.forEach((g) => paths.push(`${profileId}/${f.name}/${g.name}`));
      }
      if (paths.length) await admin.storage.from(bucket).remove(paths);
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("outcome changes persist with a timestamp (F19)", async () => {
    const { appId } = await seed();
    const before = await user.from("applications").select("outcome, outcome_updated_at").eq("id", appId).single();
    expect(before.data).toEqual({ outcome: "not_applied", outcome_updated_at: null });

    await user.from("applications").update({ outcome: "applied" }).eq("id", appId);
    const first = await user.from("applications").select("outcome, outcome_updated_at").eq("id", appId).single();
    expect(first.data!.outcome).toBe("applied");
    expect(first.data!.outcome_updated_at).not.toBeNull();

    await new Promise((r) => setTimeout(r, 1100));
    await user.from("applications").update({ outcome: "interview" }).eq("id", appId);
    const second = await user.from("applications").select("outcome, outcome_updated_at").eq("id", appId).single();
    expect(second.data!.outcome).toBe("interview");
    expect(new Date(second.data!.outcome_updated_at).getTime()).toBeGreaterThan(new Date(first.data!.outcome_updated_at).getTime());

    await user.from("applications").update({ company: "Acme Ltd" }).eq("id", appId);
    const third = await user.from("applications").select("outcome_updated_at").eq("id", appId).single();
    expect(third.data!.outcome_updated_at).toBe(second.data!.outcome_updated_at);

    const bad = await user.from("applications").update({ outcome: "hired" }).eq("id", appId);
    expect(bad.error).not.toBeNull();
  });

  it("deleting an application removes its rows and its export files", async () => {
    const { appId, exportPath, cvId } = await seed();
    expect(await fileExists("exports", exportPath)).toBe(true);
    await deleteApplication(user, appId);
    expect((await user.from("applications").select("id").eq("id", appId)).data).toEqual([]);
    expect((await admin.from("suggestions").select("id").eq("application_id", appId)).data).toEqual([]);
    expect((await admin.from("exports").select("id").eq("application_id", appId)).data).toEqual([]);
    expect(await fileExists("exports", exportPath)).toBe(false);
    expect((await user.from("cvs").select("id").eq("id", cvId)).data).toHaveLength(1);
  });

  it("deleting a CV removes its row and its PDF; applications keep their history", async () => {
    const { cvId, cvPath, appId } = await seed();
    expect(await fileExists("cvs", cvPath)).toBe(true);
    await deleteCv(user, cvId);
    expect((await user.from("cvs").select("id").eq("id", cvId)).data).toEqual([]);
    expect(await fileExists("cvs", cvPath)).toBe(false);
    const app = await user.from("applications").select("cv_id").eq("id", appId).single();
    expect(app.data!.cv_id).toBeNull();
  });
});
