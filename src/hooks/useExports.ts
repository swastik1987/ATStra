import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Suggestion } from "@/lib/applyEdits";
import type { Score } from "@/lib/scoring";
import { exportFileName } from "@/lib/docx/fileName";
import type { PointsContext } from "../../supabase/functions/_shared/points.ts";
import type { Style } from "../../supabase/functions/_shared/parseCv.ts";

export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface ExportRow {
  id: string;
  storage_path: string;
  final_score: (Score & { projected: number; diff: number; defect: boolean }) | null;
  applied_suggestion_ids: string[];
  created_at: string;
}

export function useLatestExport(applicationId: string | undefined) {
  return useQuery({
    queryKey: ["exports", applicationId],
    enabled: Boolean(applicationId),
    queryFn: async (): Promise<ExportRow | null> => {
      const { data, error } = await supabase
        .from("exports")
        .select("id, storage_path, final_score, applied_suggestion_ids, created_at")
        .eq("application_id", applicationId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ExportRow | null;
    },
  });
}

/** The file name is the last path segment after the timestamp prefix. */
export const fileNameFromPath = (path: string) => path.split("/").pop()!.replace(/^\d+-/, "");

/** F17: re-download through a signed URL that expires after 60 seconds. */
export async function downloadExport(path: string): Promise<void> {
  const { data, error } = await supabase.storage.from("exports").createSignedUrl(path, 60, { download: fileNameFromPath(path) });
  if (error || !data) throw new Error("Could not get the file. Try again.");
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface ExportInput {
  profileId: string;
  applicationId: string;
  roleTitle: string;
  company: string;
  style: Style;
  ctx: PointsContext;
  suggestions: Suggestion[];
  pageCount: number | undefined;
  spellingErrors: string[];
}

/**
 * F15, F17 and section 9 step 4: apply edits, build the DOCX, re-read and re-score it, upload
 * it, record the export, mark the application exported and download the file.
 * The docx library is loaded only here, so it stays out of the main bundle.
 */
export function useGenerateExport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ExportInput) => {
      const [{ Packer }, { buildCvDocument }, { prepareExport, rescoreExport }] = await Promise.all([
        import("docx"),
        import("@/lib/docx/build"),
        import("@/lib/exportCv"),
      ]);
      const prepared = prepareExport(input.ctx, input.style, input.suggestions);
      const name = exportFileName(prepared.cv.contact.name, input.roleTitle, input.company);
      const doc = buildCvDocument(prepared.cv, input.style, { headingLabels: prepared.headingLabels, title: name.replace(/\.docx$/, "") });
      const blob = await Packer.toBlob(doc);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const check = await rescoreExport(bytes, input.ctx, prepared, { pageCount: input.pageCount, spellingErrors: input.spellingErrors });
      if (check.defect) {
        console.warn(`[export defect] document scores ${check.score.total}, projection was ${check.projected} (diff ${check.diff})`);
      }

      const path = `${input.profileId}/${input.applicationId}/${Date.now()}-${name}`;
      const up = await supabase.storage.from("exports").upload(path, new Blob([bytes], { type: DOCX_TYPE }), { contentType: DOCX_TYPE });
      if (up.error) throw new Error("The DOCX was built but could not be saved. Try again.");
      const row = await supabase.from("exports").insert({
        application_id: input.applicationId,
        storage_path: path,
        final_score: { ...check.score, projected: check.projected, diff: check.diff, defect: check.defect },
        applied_suggestion_ids: prepared.applied.map((s) => s.id),
      });
      if (row.error) throw new Error("The DOCX was saved but not recorded. Try again.");
      await supabase.from("applications").update({ status: "exported" }).eq("id", input.applicationId);

      saveBlob(new Blob([bytes], { type: DOCX_TYPE }), name);
      return { name, check, prepared };
    },
    onSuccess: (_d, input) => {
      queryClient.invalidateQueries({ queryKey: ["exports", input.applicationId] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}
