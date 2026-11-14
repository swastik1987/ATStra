import type { ReactNode } from "react";

export function Pill({ tone, children }: { tone: "ok" | "warn" | "plain"; children: ReactNode }) {
  const cls =
    tone === "ok" ? "bg-accent-tint text-accent-ink" : tone === "warn" ? "bg-warn-tint text-warn-ink" : "bg-page text-ink border border-border";
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium ${cls}`}>{children}</span>;
}

export function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div aria-hidden="true" className="h-2 rounded-full bg-page overflow-hidden">
      <div className="h-full bg-accent rounded-full" style={{ width: `${Math.max(0, Math.min(100, Math.round((100 * value) / max)))}%` }} />
    </div>
  );
}

export const panel = "bg-surface border border-border rounded-[14px] p-6 flex flex-col gap-3 min-w-0";

/** Points with at most one decimal, without a trailing .0. */
export function formatPoints(p: number): string {
  const r = Math.round(p * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
