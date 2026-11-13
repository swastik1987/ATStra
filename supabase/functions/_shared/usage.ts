import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsageRow } from "./model.ts";

/**
 * Returns a logUsage function for createModelClient. `supabase` must be created with the
 * caller's JWT (not the service role), so the usage_log insert policy applies.
 */
export function usageLogger(supabase: SupabaseClient, userId: string) {
  return async (row: UsageRow): Promise<void> => {
    const { error } = await supabase.from("usage_log").insert({ ...row, user_id: userId });
    if (error) console.error("usage_log insert failed", error.message);
  };
}
