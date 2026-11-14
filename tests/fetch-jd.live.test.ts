/**
 * Phase 2 acceptance for fetch-jd against real sites through the deployed function.
 * No model cost, but it calls external websites. Run with RUN_LIVE_NETWORK_TESTS=1.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomBytes } from "node:crypto";

config({ path: ".env.test", quiet: true });
const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = process.env.RUN_LIVE_NETWORK_TESTS === "1" && Boolean(URL_ && ANON && SERVICE);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

/** Picks a currently open job from a public Greenhouse board, so the URL never goes stale. */
async function publicJobUrl(): Promise<string> {
  for (const board of ["gitlab", "airbnb", "stripe"]) {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs`).catch(() => null);
    if (!res?.ok) continue;
    const { jobs } = (await res.json()) as { jobs: { absolute_url: string }[] };
    const url = jobs?.find((j) => j.absolute_url?.startsWith("https://"))?.absolute_url;
    if (url) return url;
  }
  throw new Error("No public Greenhouse job found to test against");
}

describe.skipIf(!enabled)("fetch-jd acceptance (live network)", () => {
  let admin: SupabaseClient;
  let user: SupabaseClient;
  let userId = "";

  const call = async (url: string) => {
    const res = await user.functions.invoke("fetch-jd", { body: { url } });
    if (!res.error) return { ok: true as const, data: res.data };
    return { ok: false as const, code: JSON.parse((await res.error.context?.text?.()) ?? "{}").error?.code };
  };

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, opts);
    const email = `cvtailor.livetest.${Date.now()}@gmail.com`;
    const password = randomBytes(24).toString("base64url");
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    user = createClient(URL_!, ANON!, opts);
    await user.auth.signInWithPassword({ email, password });
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("fetches a public job page with readable text, title and company", async () => {
    const url = await publicJobUrl();
    const res = await call(url);
    console.log(`[fetch-jd.live] ${url} ->`, res.ok ? `${res.data.text.length} chars, "${res.data.title}" at "${res.data.company}"` : res.code);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.text.length).toBeGreaterThanOrEqual(500);
      expect(res.data.title).toBeTruthy();
    }
  }, 30_000);

  it("returns login_wall for a page behind a sign-in", async () => {
    const res = await call("https://github.com/settings/profile");
    expect(res).toEqual({ ok: false, code: "login_wall" });
  }, 30_000);

  it("returns invalid_url for http and private addresses", async () => {
    expect(await call("http://example.com/job")).toEqual({ ok: false, code: "invalid_url" });
    expect(await call("https://169.254.169.254/latest/meta-data")).toEqual({ ok: false, code: "invalid_url" });
  });
});
