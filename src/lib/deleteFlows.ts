/**
 * Delete flows (CLAUDE.md section 10): deleting a CV or an application removes its rows and
 * its files. Takes the client as a parameter so it runs in the browser and in tests.
 * Rows go first (RLS proves ownership; suggestions and exports cascade), then the files.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

async function removeFiles(client: SupabaseClient, bucket: string, paths: string[]) {
  if (!paths.length) return;
  const { error } = await client.storage.from(bucket).remove(paths);
  if (error) {
    const retry = await client.storage.from(bucket).remove(paths);
    if (retry.error) throw new Error("The record was deleted but its file could not be removed. Try again from the CV page.");
  }
}

export async function deleteApplication(client: SupabaseClient, applicationId: string): Promise<void> {
  const { data: exports, error: listError } = await client.from("exports").select("storage_path").eq("application_id", applicationId);
  if (listError) throw new Error("Could not delete the application. Try again.");
  const { data, error } = await client.from("applications").delete().eq("id", applicationId).select("id");
  if (error || !data?.length) throw new Error("Could not delete the application. Try again.");
  await removeFiles(client, "exports", (exports ?? []).map((e) => e.storage_path as string));
}

export async function deleteCv(client: SupabaseClient, cvId: string): Promise<void> {
  const { data, error } = await client.from("cvs").delete().eq("id", cvId).select("storage_path");
  if (error || !data?.length) throw new Error("Could not delete the CV. Try again.");
  await removeFiles(client, "cvs", [data[0].storage_path as string]);
}
