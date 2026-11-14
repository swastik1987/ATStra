import { Link } from "react-router-dom";
import { useId, useState } from "react";
import {
  latestExport,
  useApplications,
  useDeleteApplication,
  useUpdateOutcome,
  type ApplicationSummary,
  type Outcome,
  type Status,
} from "@/hooks/useApplications";
import { downloadExport } from "@/hooks/useExports";
import { MIN_OUTCOMES, outcomeSummary } from "@/lib/outcomes";

/** F17: re-download the last export through a 60-second signed URL. */
function DownloadLink({ path, label }: { path: string; label: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  return (
    <button
      type="button"
      className="inline-flex items-center min-h-11 font-semibold text-accent bg-transparent cursor-pointer hover:text-accent-ink"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        try {
          await downloadExport(path);
          setState("idle");
        } catch {
          setState("error");
        }
      }}
    >
      {state === "error" ? "Retry download" : "Download"}
      <span className="sr-only"> last export for {label}</span>
    </button>
  );
}

const STATUS_LABEL: Record<Status, string> = { draft: "Draft", reviewing: "Reviewing", exported: "Exported" };
export const OUTCOME_LABEL: Record<Outcome, string> = {
  not_applied: "Not applied",
  applied: "Applied",
  no_reply: "No reply",
  recruiter_call: "Recruiter call",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

const th = "text-left text-xs font-semibold uppercase tracking-[0.06em] text-muted px-4 py-3 whitespace-nowrap";
const td = "px-4 py-3 border-t border-border align-middle";
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** F19: outcome per application, saved at once with a timestamp. */
function OutcomeSelect({ app }: { app: ApplicationSummary }) {
  const id = useId();
  const update = useUpdateOutcome();
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="sr-only">
        Outcome for {app.role_title || "this application"}
      </label>
      <select
        id={id}
        value={app.outcome}
        onChange={(e) => update.mutate({ id: app.id, outcome: e.target.value as Outcome })}
        className="min-h-11 px-2 rounded-[10px] border border-border-strong bg-surface text-ink font-[inherit]"
      >
        {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((o) => (
          <option key={o} value={o}>
            {OUTCOME_LABEL[o]}
          </option>
        ))}
      </select>
      {update.isError ? (
        <span role="alert" className="text-xs text-warn-ink">
          Not saved. Try again.
        </span>
      ) : (
        app.outcome_updated_at && <span className="text-xs text-muted">since {shortDate(app.outcome_updated_at)}</span>
      )}
    </div>
  );
}

/** F20: shown once 10 applications have an outcome. */
function OutcomeSummary({ apps }: { apps: ApplicationSummary[] }) {
  const summary = outcomeSummary(
    apps.map((a) => ({ outcome: a.outcome, baseScore: a.base_score?.total ?? null, exportScore: latestExport(a)?.final_score?.total ?? null })),
  );
  if (!summary.visible) {
    return (
      <p className="m-0 text-sm text-muted">
        Once {MIN_OUTCOMES} applications have an outcome, this page shows how often each score band led to a recruiter call or better (
        {summary.withOutcome} so far).
      </p>
    );
  }
  return (
    <section aria-labelledby="outcomes-h" className="bg-surface border border-border rounded-[14px] p-6 flex flex-col gap-3">
      <h2 id="outcomes-h" className="m-0 font-heading font-bold text-xl">
        Reached a recruiter call or beyond
      </h2>
      <p className="m-0 text-sm text-muted">
        Share of applied applications, by final score. A small sample; treat it as a hint, not proof that the score predicts shortlisting.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {summary.bands.map((b) => (
          <div key={b.band} className="rounded-[10px] border border-border p-4">
            <div className="text-sm font-semibold text-muted">Score {b.label.toLowerCase()}</div>
            <div className="font-heading font-bold text-3xl">{b.share === null ? "No data" : `${Math.round(b.share * 100)}%`}</div>
            <div className="text-sm text-muted">
              {b.reached} of {b.applied} applied
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DeleteButton({ app }: { app: ApplicationSummary }) {
  const del = useDeleteApplication();
  return (
    <button
      type="button"
      className="inline-flex items-center min-h-11 font-semibold text-warn-ink bg-transparent cursor-pointer"
      disabled={del.isPending}
      onClick={() => {
        const name = app.role_title || "this application";
        if (window.confirm(`Delete ${name}? Its job description, decisions and exported files are removed. This cannot be undone.`)) {
          del.mutate(app.id, { onError: (e) => window.alert((e as Error).message) });
        }
      }}
    >
      {del.isPending ? "Deleting…" : "Delete"}
      <span className="sr-only"> {app.role_title}</span>
    </button>
  );
}

export function ApplicationsTable() {
  const apps = useApplications();

  if (apps.isLoading) return <p className="text-muted">Loading applications…</p>;
  if (apps.error) return <p role="alert">Applications could not be loaded.</p>;
  if (!apps.data?.length) {
    return (
      <section aria-label="Applications" className="bg-surface border border-border rounded-[14px] p-6 flex flex-col gap-2">
        <p className="m-0 font-semibold">No applications yet</p>
        <p className="m-0 text-muted">
          Start with <Link to="/new">New tailoring</Link>: pick your CV, paste a job description, and review the suggested edits.
        </p>
      </section>
    );
  }

  return (
    <>
      <OutcomeSummary apps={apps.data} />
      {/* relative: keeps the absolutely positioned sr-only labels inside the scroll box at phone width. */}
      <section aria-label="Applications" className="relative bg-surface border border-border rounded-[14px] overflow-x-auto">
        <table className="w-full border-collapse min-w-[860px]">
          <thead>
            <tr>
              <th scope="col" className={th}>Role</th>
              <th scope="col" className={th}>JD source</th>
              <th scope="col" className={th}>Score</th>
              <th scope="col" className={th}>Status</th>
              <th scope="col" className={th}>Outcome</th>
              <th scope="col" className={th}>Updated</th>
              <th scope="col" className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {apps.data.map((a) => (
              <tr key={a.id}>
                <td className={td}>
                  <div className="font-semibold">{a.role_title || "Untitled role"}</div>
                  <div className="text-sm text-muted">{a.company || "Company not set"}</div>
                </td>
                <td className={td}>{a.jd_source === "url" ? "Job link" : "Pasted text"}</td>
                <td className={`${td} tabular-nums whitespace-nowrap`}>
                  {a.base_score ? (
                    <>
                      <span className="font-semibold">{a.base_score.total}</span>
                      <span className="text-muted"> before</span>
                      {latestExport(a)?.final_score && (
                        <>
                          <span className="text-muted"> · </span>
                          <span className="font-semibold">{latestExport(a)!.final_score!.total}</span>
                          <span className="text-muted"> after</span>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="text-muted">Not scored</span>
                  )}
                </td>
                <td className={td}>{STATUS_LABEL[a.status]}</td>
                <td className={td}>
                  <OutcomeSelect app={a} />
                </td>
                <td className={`${td} whitespace-nowrap`}>{shortDate(a.updated_at)}</td>
                <td className={td}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <Link to={`/applications/${a.id}`} className="font-semibold">
                      Open<span className="sr-only"> {a.role_title}</span>
                    </Link>
                    {latestExport(a) && <DownloadLink path={latestExport(a)!.storage_path} label={a.role_title} />}
                    <DeleteButton app={a} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
