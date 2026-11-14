import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ParseFailedError, useMasterCv, useRetryParse, useUploadMasterCv, type UploadStage } from "@/hooks/useCvs";

const STAGE_TEXT: Record<UploadStage, string> = {
  reading: "Reading the PDF…",
  uploading: "Uploading…",
  parsing: "Reading sections and bullets. This takes about 30 seconds…",
};

function summaryLine(created: string, pages: number | undefined, sections: number | undefined) {
  const date = new Date(created).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const parts = [`Uploaded ${date}`];
  if (pages) parts.push(`${pages} ${pages === 1 ? "page" : "pages"}`);
  parts.push(sections ? `text extracted, ${sections} sections found` : "text extracted");
  return parts.join(" · ");
}

export function MasterCvCard({ profileId }: { profileId: string | undefined }) {
  const master = useMasterCv();
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<UploadStage | null>(null);
  const upload = useUploadMasterCv(profileId, setStage);
  const retry = useRetryParse(setStage);
  const busy = upload.isPending || retry.isPending;
  // Show whichever action ran last.
  const error = (retry.error ?? upload.error) as Error | null;
  const retryId = error instanceof ParseFailedError ? error.cvId : null;

  function onFile(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    retry.reset();
    upload.mutate(file, { onSettled: () => setStage(null) });
  }

  function onRetry() {
    if (!retryId) return;
    upload.reset();
    retry.mutate(retryId, { onSettled: () => setStage(null) });
  }

  const cv = master.data;
  const sections = cv?.style?.section_order?.length;

  return (
    <section
      aria-label="Master CV"
      className="flex flex-wrap items-center justify-between gap-5 px-6 py-5 bg-surface border border-border rounded-[14px]"
    >
      <div className="flex items-center gap-4 min-w-0">
        <div
          aria-hidden="true"
          className="flex items-center justify-center shrink-0 w-12 h-14 rounded-lg bg-accent-tint text-accent-ink font-bold text-xs tracking-wider"
        >
          PDF
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="text-xs font-semibold tracking-[0.06em] uppercase text-muted">Master CV</div>
          {master.isLoading ? (
            <div className="text-muted">Loading…</div>
          ) : cv ? (
            <>
              <div className="font-semibold text-base break-all">{cv.file_name}</div>
              <div className="text-muted text-sm">{summaryLine(cv.created_at, cv.parse_checks?.page_count, sections)}</div>
            </>
          ) : (
            <>
              <div className="font-semibold text-base">No master CV yet</div>
              <div className="text-muted text-sm">Text-based PDF, up to 5 MB. Scanned image PDFs cannot be read.</div>
            </>
          )}
          {busy && stage && (
            <div role="status" className="text-sm text-accent-ink">
              {STAGE_TEXT[stage]}
            </div>
          )}
          {!busy && error && (
            <div role="alert" className="mt-1 text-sm rounded-[10px] bg-warn-tint text-warn-ink px-3 py-2">
              <strong>{retryId ? "Uploaded, but reading it failed." : "Not uploaded."}</strong> {error.message}
              {cv && " Your current master CV is unchanged."}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {cv && (
          <Button asChild>
            <Link to={`/cv/${cv.id}`}>View parsed text</Link>
          </Button>
        )}
        {retryId && !busy && <Button onClick={onRetry}>Retry</Button>}
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          disabled={busy}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <Button variant={cv ? "secondary" : "primary"} disabled={busy} onClick={() => input.current?.click()}>
          {cv ? "Replace PDF" : "Upload PDF"}
        </Button>
      </div>
    </section>
  );
}
