// parse-cv: reads the CV PDF from Storage, sends it to the model, stores structured CV,
// style and parse checks. Uses the caller's JWT, never the service role (CLAUDE.md 7, 8).
import { createClient } from "@supabase/supabase-js";
import { createModelClient, ModelError } from "../_shared/model.ts";
import { usageLogger } from "../_shared/usage.ts";
import { corsHeaders, errorResponse, json, STATUS } from "../_shared/http.ts";
import { ParseCvError, ParseOutputSchema, PROMPT_VERSION, runParseCv, type CvRow } from "../_shared/parseCv.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("bad_request", "Use POST", 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return errorResponse("unauthorized", "Sign in first", 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (userError || !userData.user) return errorResponse("unauthorized", "Sign in first", 401);

  let body: { cv_id?: unknown; force?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse("bad_request", "Body must be JSON", 400);
  }
  if (typeof body.cv_id !== "string") return errorResponse("bad_request", "cv_id is required", 400);

  try {
    // Created only when the model is actually needed, so not-found and scanned answers
    // never depend on model configuration.
    const model = () =>
      createModelClient({
        env: (k) => Deno.env.get(k),
        logUsage: usageLogger(supabase, userData.user.id),
      });
    const result = await runParseCv(
      {
        getCv: async (id) => {
          const { data } = await supabase
            .from("cvs")
            .select("id, storage_path, raw_text, structured, style, parse_checks")
            .eq("id", id)
            .maybeSingle();
          return data as CvRow | null;
        },
        downloadPdf: async (path) => {
          const { data, error } = await supabase.storage.from("cvs").download(path);
          if (error || !data) throw error ?? new Error("download failed");
          return new Uint8Array(await data.arrayBuffer());
        },
        callModel: async (args) =>
          (
            await model().callStructured({
              ...args,
              functionName: "parse-cv",
              promptVersion: PROMPT_VERSION,
              name: "parsed_cv",
              schema: ParseOutputSchema,
            })
          ).data,
        save: async (id, values) => {
          const { error } = await supabase.from("cvs").update(values).eq("id", id);
          if (error) throw new Error(`Could not save the parsed CV: ${error.message}`);
        },
      },
      { cv_id: body.cv_id, force: body.force === true },
    );
    return json(result);
  } catch (e) {
    if (e instanceof ParseCvError || e instanceof ModelError) {
      console.error("parse-cv", e.code, e.message, PROMPT_VERSION);
      return errorResponse(e.code, e.message, STATUS[e.code] ?? 500);
    }
    console.error("parse-cv unexpected", e);
    return errorResponse("model_error", "Parsing failed. Try again.", 500);
  }
});
