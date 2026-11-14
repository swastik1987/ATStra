/**
 * AI credits (migration 8), against the real Supabase project. Needs .env.test; skipped without it.
 * Every usage_log row is priced by the database from model_prices (1 credit = USD 0.01), whatever
 * the inserting client sends, and my_usage() sums only the caller's own rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomBytes } from "node:crypto";

config({ path: ".env.test", quiet: true });
const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(URL_ && ANON && SERVICE);

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

async function makeUser(admin: SupabaseClient, tag: string) {
  const email = `atstra.usagetest.${tag}.${Date.now()}@gmail.com`;
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL_!, ANON!, opts);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client };
}

describe.skipIf(!enabled)("AI credits", () => {
  let admin: SupabaseClient;
  let a: Awaited<ReturnType<typeof makeUser>>;
  let b: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, opts);
    a = await makeUser(admin, "a");
    b = await makeUser(admin, "b");
  });

  afterAll(async () => {
    for (const u of [a, b]) if (u) await admin.auth.admin.deleteUser(u.id);
  });

  const row = (userId: string, model: string, input: number, output: number, extra: Record<string, unknown> = {}) => ({
    user_id: userId,
    function_name: "usage-test",
    model_id: model,
    input_tokens: input,
    output_tokens: output,
    prompt_version: "test",
    ...extra,
  });

  it("prices a row from the model's token rates, ignoring any cost the client sends", async () => {
    // Sonnet 5.5: $2 in / $10 out per million tokens. 100k in + 10k out = $0.20 + $0.10 = $0.30 = 30 credits.
    const { data, error } = await a.client
      .from("usage_log")
      .insert(row(a.id, "claude-sonnet-5-5", 100_000, 10_000, { cost_usd: 0, credits: -5 }))
      .select("cost_usd, credits")
      .single();
    expect(error).toBeNull();
    expect(Number(data!.cost_usd)).toBeCloseTo(0.3, 6);
    expect(Number(data!.credits)).toBeCloseTo(30, 4);
  });

  it("prices each allowed model at its own rate", async () => {
    const cases: [string, number][] = [
      ["claude-haiku-5-5", 0.1 * 1 + 0.5 * 1], // 1M in + 1M out
      ["claude-opus-5-5", 4 * 1 + 20 * 1],
    ];
    for (const [model, usd] of cases) {
      const { data } = await a.client.from("usage_log").insert(row(a.id, model, 1_000_000, 1_000_000)).select("cost_usd, credits").single();
      expect(Number(data!.cost_usd), model).toBeCloseTo(usd, 6);
      expect(Number(data!.credits), model).toBeCloseTo(usd * 100, 4);
    }
  });

  it("prices an unknown model at the highest listed rate, never at zero", async () => {
    const { data } = await a.client.from("usage_log").insert(row(a.id, "some-future-model", 1_000_000, 0)).select("credits").single();
    expect(Number(data!.credits)).toBeCloseTo(400, 4);
  });

  it("my_usage() totals only the caller's own rows", async () => {
    await b.client.from("usage_log").insert(row(b.id, "claude-sonnet-5-5", 500_000, 0)); // $1 = 100 credits
    const mine = await a.client.rpc("my_usage").single<{ total_credits: number; month_credits: number; calls: number }>();
    expect(mine.error).toBeNull();
    expect(Number(mine.data!.total_credits)).toBeCloseTo(30 + 60 + 2400 + 400, 3);
    expect(Number(mine.data!.month_credits)).toBeCloseTo(30 + 60 + 2400 + 400, 3);
    expect(mine.data!.calls).toBe(4);
    const theirs = await b.client.rpc("my_usage").single<{ total_credits: number; calls: number }>();
    expect(Number(theirs.data!.total_credits)).toBeCloseTo(100, 3);
    expect(theirs.data!.calls).toBe(1);
  });

  it("users cannot change prices or rewrite their credits", async () => {
    const price = await a.client.from("model_prices").update({ input_usd_per_mtok: 0 }).eq("model_id", "claude-sonnet-5-5").select();
    expect(price.data ?? []).toHaveLength(0);
    const upd = await a.client.from("usage_log").update({ credits: 0 }).eq("user_id", a.id).select();
    expect(upd.data ?? []).toHaveLength(0);
    const check = await admin.from("model_prices").select("input_usd_per_mtok").eq("model_id", "claude-sonnet-5-5").single();
    expect(Number(check.data!.input_usd_per_mtok)).toBe(2);
  });

  it("the per-user summary view is closed to signed-in users", async () => {
    const res = await a.client.from("usage_by_user").select("*");
    expect(res.error).not.toBeNull();
    const asAdmin = await admin.from("usage_by_user").select("user_id, total_credits").eq("user_id", a.id).single();
    expect(Number(asAdmin.data!.total_credits)).toBeCloseTo(2890, 3);
  });
});
