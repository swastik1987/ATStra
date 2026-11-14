/** HTTP helpers shared by edge functions. Error shape: { error: { code, message } } (CLAUDE.md section 8). */

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}

/** HTTP status for each known error code. */
export const STATUS: Record<string, number> = {
  unauthorized: 401,
  bad_request: 400,
  cv_not_found: 404,
  not_found: 404,
  scanned_pdf: 422,
  jd_too_short: 422,
  model_error: 502,
  schema_invalid: 502,
  daily_cap: 429,
  config_error: 500,
};
