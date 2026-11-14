import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface UsageSummary {
  total_credits: number;
  month_credits: number;
  calls: number;
}

export const USAGE_KEY = ["usage"] as const;

/** Mutation meta for calls that spend model tokens; the QueryClient refreshes usage after them. */
export const AI_CALL = { aiCall: true } as const;

/** The signed-in user's AI credit totals (my_usage RPC, own rows only). */
export function useUsage() {
  return useQuery({
    queryKey: USAGE_KEY,
    queryFn: async (): Promise<UsageSummary> => {
      const { data, error } = await supabase.rpc("my_usage");
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) ?? {};
      return {
        total_credits: Number(row.total_credits ?? 0),
        month_credits: Number(row.month_credits ?? 0),
        calls: Number(row.calls ?? 0),
      };
    },
    retry: false,
    staleTime: 60_000,
  });
}
