// fetch-jd: best-effort fetch of a public job posting. Signed-in users only.
import { createClient } from "@supabase/supabase-js";
import { corsHeaders, errorResponse, json } from "../_shared/http.ts";
import { FetchJdError, runFetchJd } from "../_shared/fetchJd.ts";

const STATUS: Record<string, number> = { invalid_url: 400, fetch_failed: 502, login_wall: 422, too_short: 422 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("bad_request", "Use POST", 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return errorResponse("unauthorized", "Sign in first", 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (error || !data.user) return errorResponse("unauthorized", "Sign in first", 401);

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse("bad_request", "Body must be JSON", 400);
  }
  if (typeof body.url !== "string") return errorResponse("invalid_url", "A job link is required", 400);

  try {
    return json(await runFetchJd(fetch, body.url));
  } catch (e) {
    if (e instanceof FetchJdError) return errorResponse(e.code, e.message, STATUS[e.code] ?? 500);
    console.error("fetch-jd unexpected", e);
    return errorResponse("fetch_failed", "Could not read this page. Paste the job description instead.", 502);
  }
});
