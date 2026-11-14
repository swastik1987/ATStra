import { useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";
import { HeroMock } from "@/components/landing/HeroMock";
import { StepDocxArt, StepJobArt, StepUploadArt } from "@/components/landing/StepArt";
import { TemplateShowcase } from "@/components/landing/TemplateShowcase";
import {
  GoogleG,
  IconArrowRight,
  IconChart,
  IconCheck,
  IconChevron,
  IconColumns,
  IconHand,
  IconHash,
  IconLock,
  IconQuote,
  IconShieldCheck,
} from "@/components/landing/Icons";
import { DISCLAIMER, FAQ, PRIVACY_POINTS, RUBRIC, STEPS, TRUST_POINTS } from "@/components/landing/content";

/** Reads an OAuth error that Supabase appends to the redirect URL (query or hash). */
function redirectError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const raw = params.get("error_description") ?? hash.get("error_description");
  if (!raw) return null;
  if (/gmail/i.test(raw)) return "Only Gmail accounts can use ATStra. Sign in with an @gmail.com Google account.";
  return raw.replace(/\+/g, " ");
}

function GoogleButton({ onClick, busy, tone = "accent", className }: { onClick: () => void; busy: boolean; tone?: "accent" | "white"; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "inline-flex items-center justify-center gap-3 min-h-13 pl-2 pr-6 rounded-[12px] font-semibold text-[16px] cursor-pointer transition-[transform,box-shadow] duration-150 hover:-translate-y-px disabled:opacity-70 disabled:cursor-wait",
        tone === "accent"
          ? "bg-accent text-white shadow-[0_12px_30px_-10px_rgba(29,79,216,0.7)] hover:bg-accent-ink"
          : "bg-white text-ink shadow-[0_12px_30px_-10px_rgba(0,0,0,0.45)] hover:bg-[#F4F6F9]",
        className,
      )}
    >
      <span className="grid place-items-center size-9 rounded-[9px] bg-white">
        <GoogleG />
      </span>
      {busy ? "Opening Google…" : "Continue with Google"}
    </button>
  );
}

function SectionHead({ eyebrow, title, children, id, center }: { eyebrow: string; title: ReactNode; children?: ReactNode; id: string; center?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-3 max-w-[680px]", center && "mx-auto text-center items-center")}>
      <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</span>
      <h2 id={id} className="m-0 font-heading font-bold text-[30px] sm:text-[40px] leading-[1.1] tracking-tight">
        {title}
      </h2>
      {children && <p className="m-0 text-[17px] text-muted leading-relaxed">{children}</p>}
    </div>
  );
}

const FACTS = [
  { big: "5", label: "scoring categories, published" },
  { big: "12", label: "edits at most per job, ranked by points" },
  { big: "5", label: "ATS-friendly Word templates" },
  { big: "0", label: "lines added without your say-so" },
];

const TRUST_ICONS = [IconQuote, IconHash, IconShieldCheck, IconHand];

export function Landing() {
  const session = useSession();
  const [error, setError] = useState<string | null>(redirectError);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function continueWithGoogle() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  const signInBusy = busy || session === undefined;

  return (
    <div className="landing bg-white text-ink overflow-x-clip">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-[10px]">
        Skip to content
      </a>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-border/70">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <a href="/" aria-label="ATStra home" className="inline-flex items-center min-h-11 no-underline">
            <Logo />
          </a>
          <nav aria-label="Sections" className="hidden md:flex items-center gap-1 text-[15px]">
            {[
              ["How it works", "#how-it-works"],
              ["Score", "#score"],
              ["Templates", "#templates"],
              ["FAQ", "#faq"],
            ].map(([label, href]) => (
              <a key={href} href={href} className="inline-flex items-center min-h-11 px-3 rounded-lg no-underline text-nav font-medium hover:text-ink hover:bg-page">
                {label}
              </a>
            ))}
          </nav>
          <button
            type="button"
            onClick={continueWithGoogle}
            disabled={signInBusy}
            className="inline-flex items-center min-h-11 px-4 rounded-[10px] font-semibold border border-border-strong bg-white hover:bg-page cursor-pointer disabled:opacity-70"
          >
            Sign in
          </button>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section aria-labelledby="hero-title" className="relative isolate">
          <div aria-hidden="true" className="absolute inset-0 -z-10 landing-hero-bg" />
          <div className="max-w-[1180px] mx-auto px-4 sm:px-8 pt-14 sm:pt-20 pb-20 sm:pb-28 grid gap-14 lg:grid-cols-[1.05fr_1fr] items-center">
            <div className="flex flex-col gap-6 min-w-0">
              <span className="self-start inline-flex items-center gap-2 rounded-full bg-white border border-border px-3 py-1.5 text-[13px] font-semibold text-accent-ink shadow-sm">
                <span className="size-2 rounded-full bg-accent landing-pulse" aria-hidden="true" />
                ATS CV checker and tailor
              </span>
              <h1 id="hero-title" className="m-0 font-heading font-bold text-[40px] sm:text-[56px] lg:text-[62px] leading-[1.03] tracking-[-0.02em]">
                Tailor your CV to <span className="landing-underline text-accent">every job</span>.
                <br />
                Keep every word true.
              </h1>
              <p className="m-0 text-[18px] sm:text-[19px] text-muted leading-relaxed max-w-[560px]">
                ATStra scores your CV against a job description, shows which requirements you cover and which you miss, and suggests
                evidence-backed edits one at a time. Then it hands you a clean, ATS-friendly Word file.
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <GoogleButton onClick={continueWithGoogle} busy={signInBusy} />
                <a href="#how-it-works" className="inline-flex items-center gap-1.5 min-h-11 font-semibold no-underline">
                  See how it works <IconArrowRight className="size-4" />
                </a>
              </div>
              {error && (
                <p role="alert" className="m-0 rounded-[10px] bg-warn-tint text-warn-ink px-4 py-3 max-w-[560px]">
                  <strong>Sign-in failed.</strong> {error}
                </p>
              )}
              <ul className="m-0 p-0 list-none flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-muted">
                {["Sign up with any Gmail account", "About 10 minutes per job", "You approve every line"].map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <IconCheck className="size-4 text-accent" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0 lg:pl-4">
              <HeroMock />
            </div>
          </div>
        </section>

        {/* Facts */}
        <section aria-label="ATStra in numbers" className="border-y border-border bg-page">
          <ul className="m-0 list-none max-w-[1180px] mx-auto px-4 sm:px-8 py-8 grid grid-cols-2 lg:grid-cols-4 gap-6">
            {FACTS.map((f) => (
              <li key={f.label} className="flex items-baseline gap-3">
                <span className="font-heading font-bold text-[40px] leading-none text-accent">{f.big}</span>
                <span className="text-[14px] text-muted leading-snug">{f.label}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section aria-labelledby="how-it-works" className="scroll-mt-16 max-w-[1180px] mx-auto px-4 sm:px-8 py-20 sm:py-28 flex flex-col gap-12">
          <SectionHead id="how-it-works" eyebrow="How it works" title="From job post to tailored CV in three steps" center>
            No templates to fill in and no blank page. Start from the CV you already have.
          </SectionHead>
          <ol className="m-0 p-0 list-none grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => {
              const Art = [StepUploadArt, StepJobArt, StepDocxArt][i];
              return (
                <li key={s.title} className="flex flex-col gap-4 p-5 rounded-[18px] border border-border bg-white hover:shadow-[0_20px_50px_-30px_rgba(20,40,110,0.5)] transition-shadow">
                  <Art />
                  <div className="flex items-center gap-3">
                    <span className="grid place-items-center size-8 rounded-full bg-accent text-white font-heading font-bold">{i + 1}</span>
                    <h3 className="m-0 font-heading font-bold text-[21px]">{s.title}</h3>
                  </div>
                  <p className="m-0 text-muted leading-relaxed">{s.body}</p>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Score */}
        <section aria-labelledby="score" className="scroll-mt-16 bg-page border-y border-border">
          <div className="max-w-[1180px] mx-auto px-4 sm:px-8 py-20 sm:py-28 grid gap-12 lg:grid-cols-[1fr_1.1fr] items-center">
            <div className="flex flex-col gap-6">
              <SectionHead id="score" eyebrow="The score" title="A score you can check, not a black box">
                Every point comes from a published rubric and is calculated the same way every time. Accept or skip a suggestion and the
                projected score updates instantly, so you can see what each edit is worth.
              </SectionHead>
              <p className="m-0 flex gap-3 rounded-[12px] bg-white border border-border p-4 text-[14px] text-muted leading-relaxed">
                <IconChart />
                <span>
                  <strong className="text-ink">Honest by design.</strong> {DISCLAIMER}
                </span>
              </p>
            </div>
            <ul className="m-0 p-0 list-none flex flex-col gap-3">
              {RUBRIC.map((r) => (
                <li key={r.name} className="rounded-[14px] bg-white border border-border p-4 sm:p-5 flex flex-col gap-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="m-0 font-heading font-bold text-[18px]">{r.name}</h3>
                    <span className="font-heading font-bold text-accent tabular-nums whitespace-nowrap">{r.weight} points</span>
                  </div>
                  <span className="h-2 rounded-full bg-accent-tint overflow-hidden" aria-hidden="true">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${(r.weight / 35) * 100}%` }} />
                  </span>
                  <p className="m-0 text-[14px] text-muted leading-snug">{r.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Truthful */}
        <section aria-labelledby="truthful" className="relative isolate bg-[#0B1430] text-white">
          <div aria-hidden="true" className="absolute inset-0 -z-10 landing-dark-bg" />
          <div className="max-w-[1180px] mx-auto px-4 sm:px-8 py-20 sm:py-28 grid gap-12 lg:grid-cols-[1fr_1fr] items-center">
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-3 max-w-[560px]">
                <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#9DB7FF]">Tailored, not invented</span>
                <h2 id="truthful" className="m-0 font-heading font-bold text-[30px] sm:text-[40px] leading-[1.1] tracking-tight">
                  Your experience, said the way the job says it
                </h2>
                <p className="m-0 text-[17px] text-[#C9D6FF] leading-relaxed">
                  AI rewrites are only as good as their guard rails. ATStra checks every suggestion in code before you see it, so a
                  tailored CV is still your CV.
                </p>
              </div>
              <ul className="m-0 p-0 list-none grid gap-6 sm:grid-cols-2">
                {TRUST_POINTS.map((p, i) => {
                  const I = TRUST_ICONS[i];
                  return (
                    <li key={p.title} className="flex flex-col gap-2">
                      <span className="grid place-items-center size-10 rounded-[10px] bg-white/10 text-[#9DB7FF] ring-1 ring-white/15">
                        <I />
                      </span>
                      <h3 className="m-0 font-heading font-bold text-[18px]">{p.title}</h3>
                      <p className="m-0 text-[14px] text-[#C9D6FF] leading-relaxed">{p.body}</p>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Quantify example */}
            <div
              role="img"
              aria-label="Example: a Quantify suggestion asks for the number of reports automated before it can be accepted. An unverified keyword, Tableau, asks the user to confirm and say where they used it."
              className="flex flex-col gap-4"
            >
              <div className="rounded-[16px] bg-white text-ink p-5 flex flex-col gap-3 shadow-2xl">
                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="font-semibold px-2 py-0.5 rounded bg-accent-tint text-accent-ink">Quantify · Experience</span>
                  <span className="font-semibold text-accent-ink">+3 points</span>
                </div>
                <p className="m-0 text-[14px] text-muted">Automated the weekly operations reports</p>
                <p className="m-0 text-[15px] font-medium">
                  Automated{" "}
                  <span className="inline-block min-w-[64px] border-b-2 border-accent text-accent-ink font-semibold px-1">12</span> weekly
                  operations reports, saving the team a day a week
                </p>
                <p className="m-0 text-[12px] text-muted">Type your own number to accept. ATStra will not guess it.</p>
              </div>
              <div className="rounded-[16px] bg-white text-ink p-5 flex flex-col gap-3 shadow-2xl sm:ml-10">
                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="font-semibold px-2 py-0.5 rounded bg-warn-tint text-warn-ink">Unverified · Must-have</span>
                  <span className="font-semibold text-muted">Needs your confirmation</span>
                </div>
                <p className="m-0 text-[15px] font-medium">Tableau is a must-have in this job, but your CV does not mention it.</p>
                <div className="flex flex-col gap-2 text-[13px]">
                  <span className="inline-flex items-center gap-2">
                    <span className="grid place-items-center size-5 rounded border-2 border-accent bg-accent text-white">
                      <IconCheck className="size-3.5" />
                    </span>
                    I have used Tableau
                  </span>
                  <span className="rounded-[8px] border border-border px-3 py-2 text-muted">Where: Northwind Freight, 2022 dashboards</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Templates */}
        <section aria-labelledby="templates" className="scroll-mt-16 max-w-[1180px] mx-auto px-4 sm:px-8 py-20 sm:py-28 flex flex-col gap-12">
          <SectionHead id="templates" eyebrow="Templates" title="Five clean templates that portals can read" center>
            Every template is a single-column Word file with real headings and bullet lists, no tables, text boxes or images. Your
            section order and headings stay as you wrote them.
          </SectionHead>
          <TemplateShowcase />
        </section>

        {/* Outcomes and privacy */}
        <section aria-label="Tracking and privacy" className="bg-page border-y border-border">
          <div className="max-w-[1180px] mx-auto px-4 sm:px-8 py-20 sm:py-24 grid gap-6 lg:grid-cols-2">
            <article className="rounded-[18px] bg-white border border-border p-6 sm:p-8 flex flex-col gap-4">
              <span className="grid place-items-center size-11 rounded-[12px] bg-accent-tint text-accent-ink">
                <IconColumns />
              </span>
              <h2 className="m-0 font-heading font-bold text-[26px] leading-tight">Every application in one place</h2>
              <p className="m-0 text-muted leading-relaxed">
                Each tailoring keeps its job description, score before and after, the edits you made and the file you sent. Record what
                happened next, from no reply to offer, and see which scores lead to recruiter calls once you have enough outcomes.
              </p>
              <ul className="m-0 p-0 list-none flex flex-wrap gap-2 text-[13px] font-semibold">
                {["Applied", "Recruiter call", "Interview", "Offer"].map((o, i) => (
                  <li key={o} className={cn("px-2.5 py-1 rounded-md", i === 3 ? "bg-accent text-white" : "bg-accent-tint text-accent-ink")}>
                    {o}
                  </li>
                ))}
              </ul>
            </article>
            <article className="rounded-[18px] bg-white border border-border p-6 sm:p-8 flex flex-col gap-4">
              <span className="grid place-items-center size-11 rounded-[12px] bg-accent-tint text-accent-ink">
                <IconLock />
              </span>
              <h2 className="m-0 font-heading font-bold text-[26px] leading-tight">Private by default</h2>
              <ul className="m-0 p-0 list-none flex flex-col gap-3">
                {PRIVACY_POINTS.map((p) => (
                  <li key={p} className="flex gap-2.5 text-muted leading-relaxed">
                    <IconCheck className="size-5 shrink-0 mt-0.5 text-accent" />
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq" className="scroll-mt-16 max-w-[860px] mx-auto px-4 sm:px-8 py-20 sm:py-28 flex flex-col gap-10">
          <SectionHead id="faq" eyebrow="FAQ" title="Questions, answered" center />
          <div className="flex flex-col gap-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-[14px] border border-border bg-white open:shadow-[0_16px_40px_-28px_rgba(20,40,110,0.5)]">
                <summary className="flex items-center justify-between gap-4 min-h-14 px-5 py-3 cursor-pointer list-none font-heading font-bold text-[18px] [&::-webkit-details-marker]:hidden">
                  <h3 className="m-0 text-[18px] font-bold">{f.q}</h3>
                  <IconChevron className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <p className="m-0 px-5 pb-5 text-muted leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section aria-labelledby="cta" className="px-4 sm:px-8 pb-20 sm:pb-28">
          <div className="relative isolate overflow-hidden max-w-[1180px] mx-auto rounded-[24px] bg-accent text-white px-6 sm:px-14 py-14 sm:py-16 flex flex-col items-center text-center gap-5">
            <div aria-hidden="true" className="absolute inset-0 -z-10 landing-cta-bg" />
            <h2 id="cta" className="m-0 font-heading font-bold text-[30px] sm:text-[44px] leading-[1.08] tracking-tight max-w-[760px]">
              Your next application deserves a CV written for it
            </h2>
            <p className="m-0 text-[17px] text-[#E8EEFC] max-w-[560px] leading-relaxed">
              Sign in with Google, upload your CV and paste a job. Your first tailored Word file is about ten minutes away.
            </p>
            <GoogleButton onClick={continueWithGoogle} busy={signInBusy} tone="white" className="mt-2" />
            <p className="m-0 text-[13px] text-[#E8EEFC]">Gmail accounts only. Up to 30 job analyses a day.</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-8 py-10 flex flex-col sm:flex-row gap-6 sm:items-center justify-between">
          <div className="flex flex-col gap-2">
            <Logo />
            <p className="m-0 text-[13px] text-muted max-w-[460px]">The ATStra score measures how well a CV covers a posting and how safely it parses. It does not predict shortlisting.</p>
          </div>
          <p className="m-0 text-[13px] text-muted">© {new Date().getFullYear()} ATStra</p>
        </div>
      </footer>
    </div>
  );
}
