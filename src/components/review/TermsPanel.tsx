import type { JdTerm } from "@/lib/scoring";
import type { Suggestion } from "@/lib/applyEdits";
import { normaliseForMatch } from "@/lib/pdfText";
import { Pill, panel } from "./Bits";

/** F9: found and missing JD terms; missing ones say "fix suggested" or "unverified". */
export function TermsPanel({ terms, suggestions }: { terms: JdTerm[]; suggestions: Suggestion[] }) {
  const byTerm = new Map<string, Suggestion["type"]>();
  for (const s of suggestions) {
    if (!s.term || s.status === "skipped") continue;
    const key = normaliseForMatch(s.term);
    if (s.type === "keyword" || !byTerm.has(key)) byTerm.set(key, s.type);
  }
  const found = terms.filter((t) => t.found_in_cv);
  const missing = terms.filter((t) => !t.found_in_cv);
  const note = (t: JdTerm) => {
    const type = byTerm.get(normaliseForMatch(t.term));
    return type === "keyword" ? " · fix suggested" : type === "unverified_keyword" ? " · unverified" : "";
  };

  return (
    <section aria-labelledby="kw-h" className={panel}>
      <h2 id="kw-h" className="m-0 font-heading font-bold text-xl">
        Job description terms
      </h2>
      <div className="text-sm text-muted">
        {found.length} of {terms.length} found in your CV. Required terms count double.
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-sm font-semibold">Found</div>
        <div className="flex flex-wrap gap-2">
          {found.length ? (
            found.map((t) => (
              <Pill key={t.term} tone="ok">
                {t.term}
                {t.importance === "must" ? " · required" : ""}
              </Pill>
            ))
          ) : (
            <span className="text-sm text-muted">None</span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-sm font-semibold">Missing</div>
        <div className="flex flex-wrap gap-2">
          {missing.length ? (
            missing.map((t) => (
              <Pill key={t.term} tone="warn">
                {t.term}
                {t.importance === "must" ? " · required" : ""}
                {note(t)}
              </Pill>
            ))
          ) : (
            <span className="text-sm text-muted">None</span>
          )}
        </div>
      </div>
    </section>
  );
}
