import { CATEGORY_LABELS, WEIGHTS, type Category, type Score } from "@/lib/scoring";
import { Bar } from "./Bits";

export const DISCLAIMER = "Out of 100. Measures how well the CV covers this posting and how safely it parses. It does not predict shortlisting.";

export function ScorePanel({ score, projected }: { score: Score; projected: Score }) {
  return (
    <section aria-label="Score" className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] bg-surface border border-border rounded-[14px] p-6">
      <div className="flex flex-col gap-4">
        <div className="flex gap-8">
          <div>
            <div className="text-sm font-semibold text-muted">Current</div>
            <div className="font-heading font-bold text-5xl leading-none" data-testid="current-total">
              {score.total}
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold text-muted">With accepted edits</div>
            <div className="font-heading font-bold text-5xl leading-none text-accent-ink" data-testid="projected-total" aria-live="polite">
              {projected.total}
            </div>
          </div>
        </div>
        <div role="img" aria-label={`Score ${score.total} out of 100, ${projected.total} with accepted edits`}>
          <Bar value={projected.total} max={100} />
        </div>
        <p className="m-0 text-sm text-muted">{DISCLAIMER}</p>
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="m-0 font-heading font-bold text-xl">Breakdown</h2>
        {(Object.keys(WEIGHTS) as Category[]).map((c) => {
          const cur = score.categories[c]?.score ?? 0;
          const next = projected.categories[c]?.score ?? 0;
          return (
            <div key={c} className="grid grid-cols-[minmax(0,10rem)_minmax(3rem,1fr)_auto] items-center gap-3">
              <div className="text-sm font-medium">{CATEGORY_LABELS[c]}</div>
              <Bar value={next} max={WEIGHTS[c]} />
              <div className="text-sm tabular-nums whitespace-nowrap">
                <span className="font-semibold">{next}</span> / {WEIGHTS[c]}
                {next !== cur && <span className="text-accent-ink"> (was {cur})</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
