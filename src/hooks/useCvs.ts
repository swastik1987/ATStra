import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { callFunction } from "@/lib/functions";
import { MAX_PDF_BYTES, extractPdfInBrowser } from "@/lib/pdfText";
import type { ParseChecks, StructuredCv, Style } from "../../supabase/functions/_shared/parseCv.ts";

export interface CvRecord {
  id: string;
  file_name: string;
  storage_path: string;
  raw_text: string | null;
  structured: StructuredCv | null;
  style: Style | null;
  parse_checks: (Partial<ParseChecks> & { page_count?: number }) | null;
  is_master: boolean;
  created_at: string;
}

const COLUMNS = "id, file_name, storage_path, raw_text, structured, style, parse_checks, is_master, created_at";

export function useMasterCv() {
  return useQuery({
    queryKey: ["cv", "master"],
    queryFn: async (): Promise<CvRecord | null> => {
      const { data, error } = await supabase.from("cvs").select(COLUMNS).eq("is_master", true).maybeSingle();
      if (error) throw error;
      return data as CvRecord | null;
    },
  });
}

export function useCv(id: string | undefined) {
  return useQuery({
    queryKey: ["cv", id],
    enabled: Boolean(id),
    queryFn: async (): Promise<CvRecord> => {
      const { data, error } = await supabase.from("cvs").select(COLUMNS).eq("id", id!).single();
      if (error) throw error;
      return data as CvRecord;
    },
  });
}

export class UploadError extends Error {}

/** The PDF is saved but parsing failed: retry with the same row, no re-upload needed. */
export class ParseFailedError extends Error {
  constructor(
    public readonly cvId: string,
    message: string,
  ) {
    super(message);
  }
}

export type UploadStage = "reading" | "uploading" | "parsing";

/**
 * Checks size, extracts text in the browser, rejects scans before anything is saved,
 * uploads the PDF and inserts the row (CLAUDE.md F5, section 6 step 1). Returns the CV id.
 */
async function storeCv(file: File, profileId: string | undefined, onStage: (s: UploadStage) => void): Promise<string> {
  if (!profileId) throw new UploadError("Your profile is still loading. Try again in a moment.");
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new UploadError("Choose a PDF file.");
  }
  if (file.size > MAX_PDF_BYTES) throw new UploadError("This PDF is larger than 5 MB. Export a smaller PDF and try again.");

  onStage("reading");
  let extraction;
  try {
    extraction = await extractPdfInBrowser(file);
  } catch {
    throw new UploadError("This file could not be read as a PDF.");
  }
  if (extraction.isScanned) throw new UploadError("This PDF looks scanned. Upload a text-based PDF.");

  onStage("uploading");
  const path = `${profileId}/${crypto.randomUUID()}.pdf`;
  const up = await supabase.storage.from("cvs").upload(path, file, { contentType: "application/pdf" });
  if (up.error) throw new UploadError("Upload failed. Try again.");
  const row = await supabase
    .from("cvs")
    .insert({
      profile_id: profileId,
      file_name: file.name,
      storage_path: path,
      raw_text: extraction.text,
      parse_checks: { page_count: extraction.pageCount, char_count: extraction.text.length, browser: extraction.checks },
    })
    .select("id")
    .single();
  if (row.error) {
    await supabase.storage.from("cvs").remove([path]);
    throw new UploadError("Could not save the CV. Try again.");
  }
  return row.data.id;
}

/** Runs parse-cv (section 6 step 2) and, for a master CV, makes it the master. */
async function parseCv(cvId: string, promote: boolean, onStage: (s: UploadStage) => void) {
  onStage("parsing");
  try {
    await callFunction("parse-cv", { cv_id: cvId });
    if (promote) {
      const { error } = await supabase.rpc("set_master_cv", { p_cv_id: cvId });
      if (error) throw new UploadError("Parsed, but could not set it as your master CV. Try again.");
    }
  } catch (e) {
    throw new ParseFailedError(cvId, e instanceof Error ? e.message : "Parsing failed. Try again.");
  }
}

/**
 * Upload and parse a CV. With `promote`, it becomes the master CV only after it parses,
 * so a failed parse leaves the previous master in place; the row can be retried.
 */
export function useUploadCv(profileId: string | undefined, promote: boolean, onStage: (s: UploadStage) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const id = await storeCv(file, profileId, onStage);
      await parseCv(id, promote, onStage);
      return id;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["cv"] }),
  });
}

export const useUploadMasterCv = (profileId: string | undefined, onStage: (s: UploadStage) => void) =>
  useUploadCv(profileId, true, onStage);

export function useRetryParse(promote: boolean, onStage: (s: UploadStage) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cvId: string) => parseCv(cvId, promote, onStage),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["cv"] }),
  });
}

export function useDeleteCv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { deleteCv } = await import("@/lib/deleteFlows");
      await deleteCv(supabase, id);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["cv"] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}
