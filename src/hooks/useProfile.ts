import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface Profile {
  id: string;
  display_name: string;
}

/** The signed-in user's single profile (RLS returns only their own row). */
export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from("profiles").select("id, display_name").single();
      if (error) throw error;
      return data;
    },
  });
}
