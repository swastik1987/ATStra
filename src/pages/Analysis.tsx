import { useEffect, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ReviewBoard } from "@/components/ReviewBoard";
import { Pill, panel } from "@/components/review/Bits";
import { persistSuggestion, useAnalyse, useApplication, useReanalyse, useSuggestions } from "@/hooks/useApplications";
import type { Check, StructuredCv } from "../../supabase/functions/_shared/parseCv.ts";

const PARSE_ROWS: { key: string; label: string; fixedOnExport?: boolean }[] = [
  { key: "text_extractable", label: "Text extracted from PDF" },
  { key: "standard_headings", label: "Standard section headings" },
  { key: "single_column", label: "Single-column layout", fixedOnExport: true },
  { key: "header_footer_clear", label: "Nothing in header or footer", fixedOnExport: true },
  { key: "no_tables_or_text_boxes", label: "No tables or text boxes", fixedOnExport: true },
];

function ParsePanel({ checks, cvId }: { checks: Record<string, Check> | undefined; cvId: string | undefined }) {
  return (
    <section aria-labelledby="parse-h" className={panel}>
      <h2 id="parse-h" className="m-0 font-heading font-bold text-xl">
        Parse check
      </h2>
      {PARSE_ROWS.map((r) => {
        const pass = checks?.[r.key]?.pass;
        return (
          <div key={r.key} className="flex items-center justify-between gap-3">
            <span>{r.label}</span>
            {pass === undefined ? (
              <Pill tone="plain">Unknown</Pill>
            ) : pass ? (
              <Pill tone="ok">OK</Pill>
            ) : (
              <Pill tone="warn">{r.fixedOnExport ? "Fixed on export" : "Fix suggested"}</Pill>
            )}
          </div>
        );
      })}
      {cvId && (
        <Button asChild>
          <Link to={`/cv/${cvId}`}>View text as a parser reads it</Link>
        </Button>
      )}
    </section>
  );
}

export function Analysis() {
  const { id } = useParams();
  const app = useApplication(id);
  const analyse = useAnalyse(id);
  const reanalyse = useReanalyse(id);
  const started = useRef(false);

  const analysed = Boolean(app.data?.jd_terms && app.data.base_score);
  const suggestions = useSuggestions(id, analysed);
  const needsAnalysis = app.data && !app.data.jd_terms;

  useEffect(() => {
    // Run analyse once when an application arrives without results (also after a reload).
    if (needsAnalysis && !started.current) {
      started.current = true;
      analyse.mutate();
    }
  }, [needsAnalysis, analyse]);

  const ctx = useMemo(() => {
    const a = app.data;
    if (!a?.jd_terms || !a.base_score || !a.cvs?.structured) return null;
    return { cv: a.cvs.structured as StructuredCv, jdTerms: a.jd_terms, base: a.base_score, roleTitle: a.role_title };
  }, [app.data]);

  if (app.isLoading) return <p className="text-muted">Loading…</p>;
  if (app.error || !app.data) return <p role="alert">This application could not be found.</p>;

  const a = app.data;
  const source = `${a.cvs?.is_master ? "Master CV" : "Uploaded CV"} against ${a.jd_source === "url" ? "a fetched job posting" : "pasted job description"}`;
  const stale = analysed && (a.prompt_version ?? "").startsWith("analyse.v1");
  const failure = (analyse.error ?? reanalyse.error) as (Error & { code?: string }) | null;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="text-sm text-muted">
          <Link to="/">Applications</Link> / {a.company || "Company not set"}
        </div>
        <h1 className="m-0 font-heading font-bold text-[32px] leading-tight">{a.role_title || "Untitled role"}</h1>
        <div className="text-muted">{source}</div>
      </div>

      {!analysed || !ctx ? (
        <section className={`${panel} items-start`}>
          {analyse.isPending || (!analyse.isError && !analyse.isSuccess) ? (
            <p role="status" className="m-0">
              Reading the job description against your CV. This takes about 30 seconds…
            </p>
          ) : (
            <>
              <p role="alert" className="m-0 rounded-[10px] bg-warn-tint text-warn-ink px-4 py-3">
                <strong>{failure?.message ?? "Analysis failed. Try again."}</strong> Your CV and job description are saved.
              </p>
              {failure?.code !== "daily_cap" && (
                <Button variant="primary" onClick={() => analyse.mutate()}>
                  Retry
                </Button>
              )}
            </>
          )}
        </section>
      ) : (
        <>
          {stale && (
            <section className={`${panel} items-start`}>
              <p className="m-0">
                <strong>This analysis was made before suggestions existed.</strong> Run it again to get evidence-backed edits. It uses one of your
                30 analyses for today.
              </p>
              <Button variant="primary" disabled={reanalyse.isPending} onClick={() => reanalyse.mutate()}>
                {reanalyse.isPending ? "Analysing…" : "Run analysis again"}
              </Button>
              {reanalyse.isError && (
                <p role="alert" className="m-0 text-sm text-warn-ink">
                  {failure?.message}
                </p>
              )}
            </section>
          )}
          {suggestions.isLoading ? (
            <p className="text-muted">Loading suggestions…</p>
          ) : suggestions.error ? (
            <p role="alert">Suggestions could not be loaded. Reload the page.</p>
          ) : (
            <ReviewBoard
              key={`${a.id}:${a.prompt_version}`}
              suggestions={suggestions.data ?? []}
              ctx={ctx}
              persist={persistSuggestion}
              aside={<ParsePanel checks={a.cvs?.parse_checks?.checks as Record<string, Check> | undefined} cvId={a.cvs?.id} />}
              footer={({ accepted, projected }) => (
                <section aria-label="Generate" className={`${panel} sm:flex-row sm:items-center sm:justify-between`}>
                  <div>
                    <div className="font-semibold">
                      {accepted} {accepted === 1 ? "edit" : "edits"} accepted · score {projected}
                    </div>
                    <div className="text-sm text-muted">Open and skipped suggestions are left out of the export. You can come back and change them.</div>
                  </div>
                  <Button variant="primary" size="lg" asChild>
                    <Link to={`/applications/${a.id}/export`}>Generate DOCX</Link>
                  </Button>
                </section>
              )}
            />
          )}
        </>
      )}
    </>
  );
}
