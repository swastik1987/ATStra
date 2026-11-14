// analyse: extracts JD terms once per application, scores the CV in code, stores the result.
// Uses the caller's JWT, never the service role (CLAUDE.md sections 7, 8).
import { createClient } from "@supabase/supabase-js";
import { createModelClient } from "../_shared/model.ts";
import { usageLogger } from "../_shared/usage.ts";
import { corsHeaders, errorResponse, json, STATUS } from "../_shared/http.ts";
import {
  AnalyseError,
  AnalyseOutputSchema,
  PROMPT_VERSION,
  runAnalyse,
  type ApplicationRow,
  type CvForAnalysis,
} from "../_shared/analyse.ts";
import type { Suggestion } from "../_shared/suggestionTypes.ts";

const SUGGESTION_COLUMNS =
  "id, type, category, section_ref, before_text, after_text, evidence_quote, points, status, user_text, edited_text, rank, term, source, confirmed";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("bad_request", "Use POST", 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return errorResponse("unauthorized", "Sign in first", 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (userError || !userData.user) return errorResponse("unauthorized", "Sign in first", 401);
  const userId = userData.user.id;

  let body: { application_id?: unknown; force?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse("bad_request", "Body must be JSON", 400);
  }
  if (typeof body.application_id !== "string") return errorResponse("bad_request", "application_id is required", 400);

  try {
    const result = await runAnalyse(
      {
        getApplication: async (id) => {
          const { data } = await supabase
            .from("applications")
            .select("id, cv_id, role_title, company, jd_text, jd_terms, base_score, prompt_version")
            .eq("id", id)
            .maybeSingle();
          return data as ApplicationRow | null;
        },
        getCv: async (id) => {
          const { data } = await supabase.from("cvs").select("structured, style, parse_checks, raw_text").eq("id", id).maybeSingle();
          return data as CvForAnalysis | null;
        },
        countAnalyseCallsToday: async () => {
          const midnight = new Date();
          midnight.setUTCHours(0, 0, 0, 0);
          const { count } = await supabase
            .from("usage_log")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .eq("function_name", "analyse")
            .gte("created_at", midnight.toISOString());
          return count ?? 0;
        },
        callModel: async (args) => {
          const model = createModelClient({ env: (k) => Deno.env.get(k), logUsage: usageLogger(supabase, userId) });
          const res = await model.callStructured({
            ...args,
            functionName: "analyse",
            promptVersion: PROMPT_VERSION,
            name: "jd_analysis",
            schema: AnalyseOutputSchema,
          });
          return { data: res.data, modelId: res.modelId };
        },
        getSuggestions: async (appId) => {
          const { data } = await supabase.from("suggestions").select(SUGGESTION_COLUMNS).eq("application_id", appId).order("rank");
          return (data ?? []) as Suggestion[];
        },
        replaceSuggestions: async (appId, drafts) => {
          const del = await supabase.from("suggestions").delete().eq("application_id", appId);
          if (del.error) throw new Error(`Could not clear old suggestions: ${del.error.message}`);
          if (!drafts.length) return [];
          const { data, error } = await supabase
            .from("suggestions")
            .insert(drafts.map((d) => ({ ...d, application_id: appId, status: "open", source: "model" })))
            .select(SUGGESTION_COLUMNS);
          if (error) throw new Error(`Could not save suggestions: ${error.message}`);
          return (data as Suggestion[]).sort((a, b) => a.rank - b.rank);
        },
        save: async (id, values) => {
          const { error } = await supabase.from("applications").update(values).eq("id", id);
          if (error) throw new Error(`Could not save the analysis: ${error.message}`);
        },
      },
      { application_id: body.application_id, force: body.force === true },
    );
    return json(result);
  } catch (e) {
    if (e instanceof AnalyseError) {
      console.error("analyse", e.code, e.message, PROMPT_VERSION);
      return errorResponse(e.code, e.message, STATUS[e.code] ?? 500);
    }
    console.error("analyse unexpected", e);
    return errorResponse("model_error", "Analysis failed. Try again.", 500);
  }
});
