/**
 * The hero image: a drawn-in-code view of the review screen (score, breakdown, one suggestion
 * card, the export). Synthetic content; one accessible description for the whole picture.
 */

function ScoreRing({ value, size = 104 }: { value: number; size?: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#E8EEFC" strokeWidth="9" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="#1D4FD8"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${(c * value) / 100} ${c}`}
        transform="rotate(-90 50 50)"
        className="landing-ring"
      />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fontFamily="Space Grotesk, sans-serif" fontWeight="700" fontSize="26" fill="#14181F">
        {value}
      </text>
    </svg>
  );
}

const BARS = [
  { name: "Keywords", v: 30, max: 35 },
  { name: "Impact", v: 16, max: 20 },
  { name: "Parse safety", v: 20, max: 20 },
  { name: "Title fit", v: 13, max: 15 },
];

export function HeroMock() {
  return (
    <div
      role="img"
      aria-label="The ATStra review screen: a CV scoring 61 rises to 87 with accepted edits. A suggestion card shows a bullet rewritten to name A/B testing, with the evidence quoted from the CV, and a Word file ready to download."
      className="relative w-full max-w-[560px] mx-auto"
    >
      {/* Main window */}
      <div className="relative rounded-[18px] bg-white border border-border shadow-[0_30px_80px_-20px_rgba(20,40,110,0.35)] overflow-hidden">
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border bg-page">
          <span className="size-2.5 rounded-full bg-[#F87171]" />
          <span className="size-2.5 rounded-full bg-[#FBBF24]" />
          <span className="size-2.5 rounded-full bg-[#34D399]" />
          <span className="ml-3 text-[11px] text-muted font-medium truncate">Senior Data Analyst · Northwind Freight</span>
        </div>

        <div className="grid grid-cols-[auto_1fr] gap-5 p-5 items-center">
          <ScoreRing value={87} />
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Score with your edits</span>
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-accent-tint text-accent-ink">from 61</span>
            </div>
            {BARS.map((b) => (
              <div key={b.name} className="grid grid-cols-[78px_1fr_34px] items-center gap-2 text-[11px]">
                <span className="text-muted truncate">{b.name}</span>
                <span className="h-1.5 rounded-full bg-accent-tint overflow-hidden">
                  <span className="block h-full rounded-full bg-accent landing-bar" style={{ width: `${(b.v / b.max) * 100}%` }} />
                </span>
                <span className="text-right font-semibold tabular-nums">
                  {b.v}/{b.max}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Suggestion card */}
        <div className="mx-5 mb-5 rounded-[12px] border border-border p-4 flex flex-col gap-2.5 text-[12px] leading-snug">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold px-2 py-0.5 rounded bg-accent-tint text-accent-ink text-[11px]">Keyword · Experience</span>
            <span className="font-semibold text-accent-ink text-[11px]">+8 points</span>
          </div>
          <p className="m-0 text-muted line-through decoration-[#9AA4B2]">Ran split tests on routing changes with ops</p>
          <p className="m-0 font-medium">
            Ran <mark className="bg-accent-tint text-accent-ink rounded px-0.5">A/B testing</mark> on routing changes with the operations team
          </p>
          <p className="m-0 text-muted text-[11px]">
            <span className="font-semibold text-ink">Evidence in your CV:</span> “split tests on routing”
          </p>
          <div className="flex gap-2 pt-0.5">
            <span className="inline-flex items-center px-3 py-1.5 rounded-[8px] bg-accent text-white font-semibold text-[11px]">Accept</span>
            <span className="inline-flex items-center px-3 py-1.5 rounded-[8px] border border-border-strong font-semibold text-[11px]">Edit wording</span>
            <span className="inline-flex items-center px-3 py-1.5 rounded-[8px] border border-border-strong font-semibold text-[11px]">Skip</span>
          </div>
        </div>
      </div>

      {/* Floating chips */}
      <div className="hidden sm:flex absolute -left-6 top-[42%] items-center gap-2 rounded-[12px] bg-white border border-border px-3 py-2 shadow-lg text-[12px] landing-float">
        <span className="size-6 rounded-md bg-accent-tint text-accent-ink grid place-items-center font-bold text-[10px]">JD</span>
        <span>
          <span className="block font-semibold">14 of 17 terms found</span>
          <span className="block text-muted text-[11px]">3 with a fix suggested</span>
        </span>
      </div>
      <div className="hidden sm:flex absolute -right-5 -bottom-5 items-center gap-2.5 rounded-[12px] bg-ink text-white px-3.5 py-2.5 shadow-xl text-[12px] landing-float [animation-delay:1.2s]">
        <svg width="22" height="26" viewBox="0 0 22 26" aria-hidden="true">
          <path d="M3 1h11l6 6v16a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2Z" fill="#FFFFFF" />
          <path d="M14 1v6h6" fill="#C9D6FF" />
          <path d="M5 12h11M5 15.5h11M5 19h7" stroke="#1D4FD8" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span>
          <span className="block font-semibold">Alex_Morgan_Data_Analyst.docx</span>
          <span className="block text-[#C9D6FF] text-[11px]">Single column · ready to upload</span>
        </span>
      </div>
    </div>
  );
}
