import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAnalyse, useApplication } from "@/hooks/useApplications";
import { CATEGORY_LABELS, WEIGHTS, type Category, type JdTerm, type Score } from "@/lib/scoring";
import type { Check } from "../../supabase/functions/_shared/parseCv.ts";

export const DISCLAIMER = "Out of 100. Measures how well the CV covers this posting and how safely it parses. It does not predict shortlisting.";

const PARSE_ROWS: { key: string; label: string; fixedOnExport?: boolean }[] = [
  { key: "text_extractable", label: "Text extracted from PDF" },
  { key: "standard_headings", label: "Standard section headings" },
  { key: "single_column", label: "Single-column layout", fixedOnExport: true },
  { key: "header_footer_clear", label: "Nothing in header or footer" },
  { key: "no_tables_or_text_boxes", label: "No tables or text boxes", fixedOnExport: true },
];

function Pill({ tone, children }: { tone: "ok" | "warn" | "plain"; children: React.ReactNode }) {
  const cls =
    tone === "ok" ? "bg-accent-tint text-accent-ink" : tone === "warn" ? "bg-warn-tint text-warn-ink" : "bg-page text-ink border border-border";
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium ${cls}`}>{children}</span>;
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div aria-hidden="true" className="h-2 rounded-full bg-page overflow-hidden">
      <div className="h-full bg-accent rounded-full" style={{ width: `${Math.round((100 * value) / max)}%` }} />
    </div>
  );
}

function ScorePanel({ score, projected }: { score: Score; projected: Score }) {
  return (
    <section aria-label="Score" className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] bg-surface border border-border rounded-[14px] p-6">
      <div className="flex flex-col gap-4">
        <div className="flex gap-8">
          <div>
            <div className="text-sm font-semibold text-muted">Current</div>
            <div className="font-heading font-bold text-5xl leading-none">{score.total}</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-muted">With accepted edits</div>
            <div className="font-heading font-bold text-5xl leading-none text-accent-ink">{projected.total}</div>
          </div>
        </div>
        <div role="img" aria-label={`Score ${score.total} out of 100, ${projected.total} with accepted edits`}>
          <Bar value={projected.total} max={100} />
        </div>
        <p className="m-0 text-sm text-muted">{DISCLAIMER}</p>
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="m-0 font-heading font-bold text-xl">Breakdown</h2>
        {(Object.keys(WEIGHTS) as Category[]).map((c) => (
          <div key={c} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
            <div className="text-sm font-medium">{CATEGORY_LABELS[c]}</div>
            <Bar value={projected.categories[c].score} max={WEIGHTS[c]} />
            <div className="text-sm tabular-nums">
              <span className="font-semibold">{projected.categories[c].score}</span> / {WEIGHTS[c]}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TermsPanel({ terms }: { terms: JdTerm[] }) {
  const found = terms.filter((t) => t.found_in_cv);
  const missing = terms.filter((t) => !t.found_in_cv);
  return (
    <section aria-labelledby="kw-h" className="bg-surface border border-border rounded-[14px] p-6 flex flex-col gap-3">
      <h2 id="kw-h" className="m-0 font-heading font-bold text-xl">
        Job description terms
      </h2>
      <div className="text-sm text-muted">
        {found.length} of {terms.length} found in your CV. Required terms count double.
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-sm font-semibold">Found</div>
        <div className="flex flex-wrap gap-2">
          {found.length ? found.map((t) => <Pill key={t.term} tone="ok">{t.term}{t.importance === "must" ? " · required" : ""}</Pill>) : <span className="text-sm text-muted">None</span>}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-sm font-semibold">Missing</div>
        <div className="flex flex-wrap gap-2">
          {missing.length ? missing.map((t) => <Pill key={t.term} tone="warn">{t.term}{t.importance === "must" ? " · required" : ""}</Pill>) : <span className="text-sm text-muted">None</span>}
        </div>
      </div>
    </section>
  );
}

function ParsePanel({ checks, cvId }: { checks: Record<string, Check> | undefined; cvId: string | undefined }) {
  return (
    <section aria-labelledby="parse-h" className="bg-surface border border-border rounded-[14px] p-6 flex flex-col gap-3">
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
  const started = useRef(false);

  const needsAnalysis = app.data && !app.data.jd_terms;
  useEffect(() => {
    // Run analyse once when an application arrives without results (also after a reload).
    if (needsAnalysis && !started.current) {
      started.current = true;
      analyse.mutate();
    }
  }, [needsAnalysis, analyse]);

  if (app.isLoading) return <p className="text-muted">Loading…</p>;
  if (app.error || !app.data) return <p role="alert">This application could not be found.</p>;

  const a = app.data;
  const title = a.role_title || "Untitled role";
  const source = `${a.cvs?.is_master ? "Master CV" : "Uploaded CV"} against ${a.jd_source === "url" ? "a fetched job posting" : "pasted job description"}`;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="text-sm text-muted">
          <Link to="/">Applications</Link> / {a.company || "Company not set"}
        </div>
        <h1 className="m-0 font-heading font-bold text-[32px] leading-tight">{title}</h1>
        <div className="text-muted">{source}</div>
      </div>

      {!a.base_score || !a.jd_terms ? (
        <section className="bg-surface border border-border rounded-[14px] p-6 flex flex-col gap-3 items-start">
          {analyse.isPending || (!analyse.isError && !analyse.isSuccess) ? (
            <p role="status" className="m-0">
              Reading the job description against your CV. This takes about 20 seconds…
            </p>
          ) : (
            <>
              <p role="alert" className="m-0 rounded-[10px] bg-warn-tint text-warn-ink px-4 py-3">
                <strong>{(analyse.error as Error)?.message ?? "Analysis failed. Try again."}</strong> Your CV and job description are saved.
              </p>
              {(analyse.error as { code?: string })?.code !== "daily_cap" && (
                <Button variant="primary" onClick={() => analyse.mutate()}>
                  Retry
                </Button>
              )}
            </>
          )}
        </section>
      ) : (
        <>
          <ScorePanel score={a.base_score} projected={a.base_score} />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section aria-labelledby="sug-h" className="bg-surface border border-border rounded-[14px] p-6 flex flex-col gap-2">
              <h2 id="sug-h" className="m-0 font-heading font-bold text-xl">
                Suggestions
              </h2>
              <p className="m-0 text-muted">Evidence-backed edits arrive in the next phase. The score above already reflects your CV as it is.</p>
            </section>
            <aside className="flex flex-col gap-6">
              <TermsPanel terms={a.jd_terms} />
              <ParsePanel checks={a.cvs?.parse_checks?.checks as Record<string, Check> | undefined} cvId={a.cvs?.id} />
            </aside>
          </div>
        </>
      )}
    </>
  );
}
