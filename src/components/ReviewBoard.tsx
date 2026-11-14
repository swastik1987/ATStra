import { useMemo, useState, type ReactNode } from "react";
import { applyEdits, type Suggestion } from "@/lib/applyEdits";
import { pointsFor, projectFromSuggestions, type PointsContext } from "../../supabase/functions/_shared/points.ts";
import { ScorePanel } from "./review/ScorePanel";
import { TermsPanel } from "./review/TermsPanel";
import { SuggestionCard, type Patch } from "./review/SuggestionCard";
import { panel } from "./review/Bits";

export interface ReviewBoardProps {
  suggestions: Suggestion[];
  ctx: PointsContext;
  /** Saves one decision. The score never waits for it (F12); it runs in the background (F18). */
  persist: (id: string, patch: Patch) => Promise<void>;
  aside?: ReactNode;
  footer?: (summary: { accepted: number; projected: number }) => ReactNode;
}

export function ReviewBoard({ suggestions, ctx, persist, aside, footer }: ReviewBoardProps) {
  const [items, setItems] = useState(() => [...suggestions].sort((a, b) => a.rank - b.rank));
  const [saveError, setSaveError] = useState(false);

  // Everything below is computed locally from state: no network call is involved.
  const projected = useMemo(() => projectFromSuggestions(items, ctx), [items, ctx]);
  const conflicts = useMemo(() => {
    const { conflicts: list } = applyEdits(ctx.cv, items);
    const rankOf = new Map(items.map((s) => [s.id, s.rank]));
    return new Map(list.map((c) => [c.id, rankOf.get(c.with) ?? null]));
  }, [items, ctx]);
  const counts = {
    accepted: items.filter((s) => s.status === "accepted").length,
    skipped: items.filter((s) => s.status === "skipped").length,
    open: items.filter((s) => s.status === "open").length,
  };

  function change(id: string, patch: Patch, persistNow: boolean) {
    setItems((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    if (!persistNow) return;
    persist(id, patch).then(
      () => setSaveError(false),
      () => setSaveError(true),
    );
  }

  return (
    <>
      <ScorePanel score={ctx.base} projected={projected} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="sug-h" className="flex flex-col gap-4 min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="sug-h" className="m-0 font-heading font-bold text-xl">
              Suggestions
            </h2>
            <div className="text-sm text-muted">
              {counts.accepted} accepted · {counts.skipped} skipped · {counts.open} open
            </div>
          </div>
          {saveError && (
            <p role="alert" className="m-0 text-sm rounded-[10px] bg-warn-tint text-warn-ink px-3 py-2">
              Your last change was not saved. Check your connection; the next change will try again.
            </p>
          )}
          {items.length === 0 ? (
            <div className={panel}>
              <p className="m-0 font-semibold">No safe edits found</p>
              <p className="m-0 text-sm text-muted">Every proposed edit failed the checks that stop invented content. The score and term coverage above still apply.</p>
            </div>
          ) : (
            items.map((s) => (
              <SuggestionCard
                key={s.id}
                s={s}
                cv={ctx.cv}
                points={s.status === "accepted" ? pointsFor(s, ctx, "effective") : pointsFor(s, ctx, "estimate")}
                conflictWith={conflicts.get(s.id) ?? null}
                onChange={(patch, now) => change(s.id, patch, now)}
              />
            ))
          )}
        </section>
        <aside className="flex flex-col gap-6 min-w-0">
          <TermsPanel terms={ctx.jdTerms} suggestions={items} />
          {aside}
        </aside>
      </div>
      {footer?.({ accepted: counts.accepted, projected: projected.total })}
    </>
  );
}
