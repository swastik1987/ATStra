import { Link } from "react-router-dom";
import { useState } from "react";
import { latestExport, useApplications, type Outcome, type Status } from "@/hooks/useApplications";
import { downloadExport } from "@/hooks/useExports";

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
const OUTCOME_LABEL: Record<Outcome, string> = {
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

export function ApplicationsTable() {
  const apps = useApplications();

  if (apps.isLoading) return <p className="text-muted">Loading applications…</p>;
  if (apps.error) return <p role="alert">Applications could not be loaded.</p>;
  if (!apps.data?.length) {
    return (
      <section aria-label="Applications" className="bg-surface border border-border rounded-[14px] p-6 text-muted">
        No applications yet. Start with New tailoring.
      </section>
    );
  }

  return (
    <section aria-label="Applications" className="bg-surface border border-border rounded-[14px] overflow-x-auto">
      <table className="w-full border-collapse min-w-[760px]">
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
              <td className={`${td} tabular-nums`}>
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
              <td className={td}>{OUTCOME_LABEL[a.outcome]}</td>
              <td className={`${td} whitespace-nowrap`}>{new Date(a.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</td>
              <td className={td}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Link to={`/applications/${a.id}`} className="font-semibold">
                    Open<span className="sr-only"> {a.role_title}</span>
                  </Link>
                  {latestExport(a) && <DownloadLink path={latestExport(a)!.storage_path} label={a.role_title} />}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
