import { Link, useOutletContext } from "react-router-dom";
import { MasterCvCard } from "@/components/MasterCvCard";
import type { LayoutContext } from "@/components/AppLayout";

export function Applications() {
  const { profileId } = useOutletContext<LayoutContext>();
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 font-heading font-bold text-[32px] leading-tight">Applications</h1>
          <p className="m-0 text-muted">
            One tailored CV per job. Each keeps its job description, score, accepted edits and what happened after you applied.
          </p>
        </div>
        <Link
          to="/new"
          className="inline-flex items-center gap-2 min-h-12 px-5 rounded-[10px] bg-accent text-white font-semibold no-underline hover:bg-accent-ink hover:text-white"
        >
          New tailoring
        </Link>
      </div>
      <MasterCvCard profileId={profileId} />
      <section aria-label="Applications" className="bg-surface border border-border rounded-[14px] p-6 text-muted">
        No applications yet. The applications table arrives in phase 2.
      </section>
    </>
  );
}
