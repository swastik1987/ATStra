import { useRef, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { LayoutContext } from "@/components/AppLayout";
import { ParseFailedError, useMasterCv, useRetryParse, useUploadCv, type UploadStage } from "@/hooks/useCvs";
import { useCreateApplication, useFetchJd } from "@/hooks/useApplications";
import { guessRoleAndCompany } from "@/lib/jdGuess";
import { cn } from "@/lib/utils";

const MIN_JD_CHARS = 300;

const STAGE_TEXT: Record<UploadStage, string> = {
  reading: "Reading the PDF…",
  uploading: "Uploading…",
  parsing: "Reading sections and bullets. This takes about 30 seconds…",
};

const card = "bg-surface border border-border rounded-[14px] p-6 flex flex-col gap-4 min-w-0";
const fieldLabel = "font-semibold text-sm";
const input =
  "w-full min-h-11 px-3 rounded-[10px] border border-border-strong bg-surface text-ink font-[inherit] focus-visible:outline-3 focus-visible:outline-accent";

function Choice(props: { checked: boolean; onChange: () => void; title: string; note: string }) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 p-4 rounded-[10px] border cursor-pointer",
        props.checked ? "border-accent bg-accent-tint" : "border-border",
      )}
    >
      <input type="radio" name="cvsrc" checked={props.checked} onChange={props.onChange} className="mt-1 w-4 h-4 accent-accent" />
      <span className="flex flex-col">
        <span className="font-semibold">{props.title}</span>
        <span className="text-sm text-muted">{props.note}</span>
      </span>
    </label>
  );
}

export function NewTailoring() {
  const { profileId } = useOutletContext<LayoutContext>();
  const navigate = useNavigate();
  const master = useMasterCv();

  // CV choice
  const [useMaster, setUseMaster] = useState(true);
  const [stage, setStage] = useState<UploadStage | null>(null);
  const [oneOffCv, setOneOffCv] = useState<{ id: string; name: string } | null>(null);
  const upload = useUploadCv(profileId, false, setStage);
  const retry = useRetryParse(false, setStage);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadError = (retry.error ?? upload.error) as Error | null;
  const retryId = uploadError instanceof ParseFailedError ? uploadError.cvId : null;

  // JD
  const [tab, setTab] = useState<"text" | "url">("text");
  const [jdText, setJdText] = useState("");
  const [jdUrl, setJdUrl] = useState("");
  const [fetchedFrom, setFetchedFrom] = useState<string | null>(null);
  const fetchJd = useFetchJd();
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const touched = useRef({ role: false, company: false });

  const create = useCreateApplication();
  const masterReady = Boolean(master.data?.structured);
  const cvId = useMaster ? (masterReady ? master.data!.id : null) : oneOffCv?.id ?? null;
  const jdLength = jdText.trim().length;
  const canAnalyse = Boolean(cvId && profileId && jdLength >= MIN_JD_CHARS && !create.isPending);

  /** Fills role and company from the posting unless the user has typed them (F7). */
  function prefill(text: string, fetched?: { title: string; company: string }) {
    const g = fetched ? { role: fetched.title, company: fetched.company } : guessRoleAndCompany(text);
    if (!touched.current.role && g.role) setRole(g.role);
    if (!touched.current.company && g.company) setCompany(g.company);
  }

  function onFile(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    setOneOffCv(null);
    retry.reset();
    upload.mutate(file, {
      onSuccess: (id) => setOneOffCv({ id, name: file.name }),
      onSettled: () => setStage(null),
    });
  }

  function onRetry() {
    if (!retryId) return;
    upload.reset();
    retry.mutate(retryId, {
      onSuccess: () => setOneOffCv({ id: retryId, name: "Uploaded PDF" }),
      onSettled: () => setStage(null),
    });
  }

  function onFetch() {
    setFetchedFrom(null);
    fetchJd.mutate(jdUrl, {
      onSuccess: (res) => {
        setJdText(res.text);
        setFetchedFrom(new URL(jdUrl).hostname);
        prefill(res.text, { title: res.title, company: res.company });
      },
    });
  }

  async function onAnalyse() {
    if (!canAnalyse) return;
    const id = await create.mutateAsync({
      profileId: profileId!,
      cvId: cvId!,
      roleTitle: role,
      company,
      jdSource: tab === "url" && fetchedFrom ? "url" : "text",
      jdUrl: tab === "url" && fetchedFrom ? jdUrl : null,
      jdText: jdText.trim(),
    });
    navigate(`/applications/${id}`);
  }

  const uploadBusy = upload.isPending || retry.isPending;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-heading font-bold text-[32px] leading-tight">New tailoring</h1>
        <p className="m-0 text-muted">Pick the CV, add the job description, then run the analysis. Nothing is rewritten until you accept it.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-labelledby="cv-h" className={card}>
          <h2 id="cv-h" className="m-0 font-heading font-bold text-xl">
            1. CV
          </h2>
          <Choice
            checked={useMaster}
            onChange={() => setUseMaster(true)}
            title="Use master CV"
            note={
              master.isLoading
                ? "Loading…"
                : master.data
                  ? `${master.data.file_name} · uploaded ${new Date(master.data.created_at).toLocaleDateString()}`
                  : "No master CV yet. Upload one on the Applications page, or upload a PDF here."
            }
          />
          <Choice checked={!useMaster} onChange={() => setUseMaster(false)} title="Upload a different PDF" note="Used for this application only" />
          {!useMaster && (
            <div className="flex flex-col items-start gap-2 p-5 rounded-[10px] border-2 border-dashed border-border-strong">
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
              <Button onClick={() => fileInput.current?.click()} disabled={uploadBusy}>
                {oneOffCv ? "Choose another PDF" : "Choose PDF"}
              </Button>
              <div className="text-sm text-muted">Text-based PDF, up to 5 MB. Scanned image PDFs cannot be read.</div>
              {uploadBusy && stage && (
                <div role="status" className="text-sm text-accent-ink">
                  {STAGE_TEXT[stage]}
                </div>
              )}
              {oneOffCv && !uploadBusy && (
                <div role="status" className="text-sm">
                  <span className="inline-flex px-2 py-0.5 mr-2 rounded-md text-xs font-semibold bg-accent-tint text-accent-ink">Ready</span>
                  {oneOffCv.name}
                </div>
              )}
              {uploadError && !uploadBusy && (
                <div role="alert" className="text-sm rounded-[10px] bg-warn-tint text-warn-ink px-3 py-2">
                  {uploadError.message}
                  {retryId && (
                    <Button className="ml-2 min-h-9" onClick={onRetry}>
                      Retry
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          {useMaster && master.data && !masterReady && (
            <p role="alert" className="m-0 text-sm rounded-[10px] bg-warn-tint text-warn-ink px-3 py-2">
              Your master CV has not been read yet. Open the Applications page and replace it, or upload a PDF here.
            </p>
          )}
        </section>

        <section aria-labelledby="jd-h" className={card}>
          <h2 id="jd-h" className="m-0 font-heading font-bold text-xl">
            2. Job description
          </h2>
          <div role="group" aria-label="Job description source" className="flex gap-1 p-1 rounded-[10px] bg-page self-start">
            {(["text", "url"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "min-h-11 px-4 rounded-lg font-semibold cursor-pointer",
                  tab === t ? "bg-surface text-ink shadow-sm" : "text-nav bg-transparent",
                )}
              >
                {t === "text" ? "Paste text" : "Job link"}
              </button>
            ))}
          </div>

          {tab === "url" && (
            <div className="flex flex-col gap-2">
              <label htmlFor="jdurl" className={fieldLabel}>
                Job posting URL
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="jdurl"
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  value={jdUrl}
                  onChange={(e) => setJdUrl(e.target.value)}
                  className={cn(input, "flex-1 min-w-[220px]")}
                />
                <Button onClick={onFetch} disabled={!jdUrl.trim() || fetchJd.isPending}>
                  {fetchJd.isPending ? "Fetching…" : "Fetch posting"}
                </Button>
              </div>
              {fetchJd.isError && (
                <div role="status" className="flex gap-2 rounded-[10px] bg-warn-tint text-warn-ink px-4 py-3 text-sm">
                  <div>
                    <strong>Could not read this page.</strong> {(fetchJd.error as Error).message} LinkedIn and Naukri postings usually need a
                    sign-in.{" "}
                    <button type="button" className="underline font-semibold cursor-pointer bg-transparent text-warn-ink" onClick={() => setTab("text")}>
                      Switch to Paste text
                    </button>{" "}
                    and copy the posting in.
                  </div>
                </div>
              )}
              {fetchedFrom && (
                <div role="status" className="text-sm text-muted">
                  Fetched {jdLength.toLocaleString()} characters from {fetchedFrom}. Check the text below and trim anything that is not part of
                  the posting.
                </div>
              )}
            </div>
          )}

          {(tab === "text" || fetchedFrom) && (
            <div className="flex flex-col gap-2">
              <label htmlFor="jdtext" className={fieldLabel}>
                Job description text
              </label>
              <textarea
                id="jdtext"
                rows={12}
                value={jdText}
                placeholder="Paste the full posting, including responsibilities and requirements."
                onChange={(e) => setJdText(e.target.value)}
                onBlur={() => prefill(jdText)}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text");
                  if (!jdText.trim()) prefill(pasted);
                }}
                className={cn(input, "py-2 leading-relaxed resize-y")}
              />
              <div className="text-sm text-muted">
                {tab === "text" ? "Most reliable option. Works for postings behind a login." : null}
                {jdLength > 0 && jdLength < MIN_JD_CHARS && ` Add the full posting: at least ${MIN_JD_CHARS} characters (now ${jdLength}).`}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="role" className={fieldLabel}>
                Role title
              </label>
              <input
                id="role"
                type="text"
                placeholder="Detected from the posting"
                value={role}
                onChange={(e) => {
                  touched.current.role = true;
                  setRole(e.target.value);
                }}
                className={input}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="company" className={fieldLabel}>
                Company
              </label>
              <input
                id="company"
                type="text"
                placeholder="Detected from the posting"
                value={company}
                onChange={(e) => {
                  touched.current.company = true;
                  setCompany(e.target.value);
                }}
                className={input}
              />
            </div>
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm text-muted max-w-xl">
          Analysis takes about 20 seconds and uses one model call to read the job description against your CV. The score itself is calculated
          by the app, not the model.
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button variant="primary" size="lg" onClick={onAnalyse} disabled={!canAnalyse}>
            {create.isPending ? "Saving…" : "Analyse CV against this job"}
          </Button>
          {create.isError && (
            <p role="alert" className="m-0 text-sm text-warn-ink">
              {(create.error as Error).message}
            </p>
          )}
          {!cvId && (
            <p className="m-0 text-sm text-muted">
              {useMaster ? (
                <>
                  Needs a master CV. <Link to="/">Upload one</Link> or choose Upload a different PDF.
                </>
              ) : (
                "Upload a PDF first."
              )}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
