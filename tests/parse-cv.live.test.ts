/**
 * Phase 1 acceptance against the deployed parse-cv function and the real model.
 * Costs model tokens, so it runs only with RUN_LIVE_MODEL_TESTS=1 and a filled .env.test:
 *   set RUN_LIVE_MODEL_TESTS=1 && npm test -- parse-cv.live
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractPdfText, normaliseForMatch } from "../src/lib/pdfText.ts";
import { bulletsByRole, type StructuredCv } from "../supabase/functions/_shared/parseCv.ts";

config({ path: ".env.test", quiet: true });
const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled = process.env.RUN_LIVE_MODEL_TESTS === "1" && Boolean(URL_ && ANON && SERVICE);

const content = JSON.parse(readFileSync("tests/fixtures/cv-content.json", "utf8"));
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!enabled)("parse-cv acceptance (live model)", () => {
  let admin: SupabaseClient;
  let user: SupabaseClient;
  let userId = "";
  let profileId = "";
  const paths: string[] = [];
  const parsed: Record<string, { structured: StructuredCv; style: Record<string, unknown>; parse_checks: Record<string, unknown> }> = {};

  async function uploadAndParse(file: string) {
    const bytes = new Uint8Array(readFileSync(`tests/fixtures/${file}`));
    const extraction = await extractPdfText(pdfjs, bytes.slice());
    const path = `${profileId}/${file}`;
    paths.push(path);
    const up = await user.storage.from("cvs").upload(path, new Blob([bytes], { type: "application/pdf" }), { contentType: "application/pdf" });
    if (up.error) throw up.error;
    const row = await user
      .from("cvs")
      .insert({
        profile_id: profileId,
        file_name: file,
        storage_path: path,
        raw_text: extraction.text,
        parse_checks: { page_count: extraction.pageCount, char_count: extraction.text.length, browser: extraction.checks },
      })
      .select("id")
      .single();
    if (row.error) throw row.error;
    const res = await user.functions.invoke("parse-cv", { body: { cv_id: row.data.id } });
    if (res.error) {
      const body = await res.error.context?.text?.();
      throw new Error(`parse-cv failed for ${file}: ${body ?? res.error.message}`);
    }
    return res.data;
  }

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, opts);
    const email = `cvtailor.livetest.${Date.now()}@gmail.com`;
    const password = randomBytes(24).toString("base64url");
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    userId = created.data.user.id;
    user = createClient(URL_!, ANON!, opts);
    const s = await user.auth.signInWithPassword({ email, password });
    if (s.error) throw s.error;
    profileId = (await user.from("profiles").select("id").single()).data!.id;
    parsed.single = await uploadAndParse("cv-single-column.pdf");
    parsed.two = await uploadAndParse("cv-two-column.pdf");
  }, 240_000);

  afterAll(async () => {
    if (!admin) return;
    if (paths.length) await admin.storage.from("cvs").remove(paths);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("single column: every bullet appears in structured", () => {
    const got = bulletsByRole(parsed.single.structured).flatMap((r) => r.bullets);
    for (const role of content.experience) {
      for (const b of role.bullets) expect(got, b).toContain(normaliseForMatch(b));
    }
  });

  it("two column: same bullets in the same role order as the single-column twin", () => {
    expect(bulletsByRole(parsed.two.structured)).toEqual(bulletsByRole(parsed.single.structured));
  });

  it("nothing in structured is missing from the PDF text", () => {
    for (const p of Object.values(parsed)) {
      expect((p.parse_checks as { transcription: { unmatched: unknown[] } }).transcription.unmatched).toEqual([]);
    }
  });

  it("style: two-column source detected, sans font, accent colour read", () => {
    expect(parsed.two.style.source_columns).toBe(2);
    expect(parsed.single.style.source_columns).toBe(1);
    expect(parsed.single.style.font_class).toBe("sans");
    expect(parsed.single.style.accent_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("server rejects a CV row with no text as scanned, without a model call", async () => {
    const row = await user
      .from("cvs")
      .insert({ profile_id: profileId, file_name: "scan.pdf", storage_path: `${profileId}/scan.pdf`, raw_text: "" })
      .select("id")
      .single();
    const res = await user.functions.invoke("parse-cv", { body: { cv_id: row.data!.id } });
    const body = JSON.parse((await res.error?.context?.text?.()) ?? "{}");
    expect(body.error?.code).toBe("scanned_pdf");
  });
});
