import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { callFunction } from "@/lib/functions";
import type { JdTerm, Score } from "@/lib/scoring";
import type { CvRecord } from "@/hooks/useCvs";

export type Outcome = "not_applied" | "applied" | "no_reply" | "recruiter_call" | "interview" | "offer" | "rejected";
export type Status = "draft" | "reviewing" | "exported";

export interface ApplicationSummary {
  id: string;
  role_title: string;
  company: string;
  jd_source: "text" | "url";
  base_score: Score | null;
  status: Status;
  outcome: Outcome;
  updated_at: string;
}

export interface ApplicationDetail extends ApplicationSummary {
  cv_id: string | null;
  jd_url: string | null;
  jd_text: string | null;
  jd_terms: JdTerm[] | null;
  cvs: Pick<CvRecord, "id" | "file_name" | "structured" | "parse_checks" | "is_master"> | null;
}

export function useApplications() {
  return useQuery({
    queryKey: ["applications"],
    queryFn: async (): Promise<ApplicationSummary[]> => {
      const { data, error } = await supabase
        .from("applications")
        .select("id, role_title, company, jd_source, base_score, status, outcome, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as ApplicationSummary[];
    },
  });
}

export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: ["applications", id],
    enabled: Boolean(id),
    queryFn: async (): Promise<ApplicationDetail> => {
      const { data, error } = await supabase
        .from("applications")
        .select(
          "id, role_title, company, jd_source, jd_url, jd_text, jd_terms, base_score, status, outcome, updated_at, cv_id, cvs(id, file_name, structured, parse_checks, is_master)",
        )
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as ApplicationDetail;
    },
  });
}

export interface NewApplication {
  profileId: string;
  cvId: string;
  roleTitle: string;
  company: string;
  jdSource: "text" | "url";
  jdUrl: string | null;
  jdText: string;
}

/** Saves the draft first (F18): inputs survive a failed or interrupted analysis. */
export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (a: NewApplication): Promise<string> => {
      const { data, error } = await supabase
        .from("applications")
        .insert({
          profile_id: a.profileId,
          cv_id: a.cvId,
          role_title: a.roleTitle.trim(),
          company: a.company.trim(),
          jd_source: a.jdSource,
          jd_url: a.jdUrl,
          jd_text: a.jdText,
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw new Error("Could not save the application. Try again.");
      return data.id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });
}

export function useAnalyse(applicationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => callFunction("analyse", { application_id: applicationId }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });
}

export interface FetchedJd {
  text: string;
  title: string;
  company: string;
}

export function useFetchJd() {
  return useMutation({ mutationFn: (url: string) => callFunction<FetchedJd>("fetch-jd", { url }) });
}
