import { Link } from "react-router-dom";
import { useApplications, type Outcome, type Status } from "@/hooks/useApplications";

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
                  </>
                ) : (
                  <span className="text-muted">Not scored</span>
                )}
              </td>
              <td className={td}>{STATUS_LABEL[a.status]}</td>
              <td className={td}>{OUTCOME_LABEL[a.outcome]}</td>
              <td className={`${td} whitespace-nowrap`}>{new Date(a.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</td>
              <td className={td}>
                <Link to={`/applications/${a.id}`} className="font-semibold">
                  Open<span className="sr-only"> {a.role_title}</span>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
