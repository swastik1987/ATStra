import { useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { LayoutContext } from "@/components/AppLayout";
import { formatPoints, panel } from "@/components/review/Bits";
import { sectionLabel } from "@/components/review/SuggestionCard";
import { useApplication, useSuggestions } from "@/hooks/useApplications";
import { TemplatePicker } from "@/components/TemplatePicker";
import { DEFAULT_TEMPLATE, TEMPLATES, getTemplate, type TemplateId } from "@/lib/docx/templates";

const TEMPLATE_KEY = "cv-tailor-template";
import { downloadExport, fileNameFromPath, useGenerateExport, useLatestExport } from "@/hooks/useExports";
import { applyEdits, type Suggestion } from "@/lib/applyEdits";
import { cvText, termFound } from "@/lib/scoring";
import { normaliseForMatch } from "@/lib/pdfText";
import { pointsFor, projectFromSuggestions } from "../../supabase/functions/_shared/points.ts";
import type { Style, StructuredCv } from "../../supabase/functions/_shared/parseCv.ts";

const TEMPLATE_FIX = /^\/_format\//;

const TYPE_LABEL: Record<Suggestion["type"], string> = {
  rewrite: "Rewrite",
  keyword: "Keyword",
  quantify: "Quantify",
  unverified_keyword: "Unverified keyword",
  format: "Format",
  hygiene: "Hygiene",
};

function describe(s: Suggestion): string {
  switch (s.type) {
    case "keyword":
      return `"${s.term}" used in place of your wording`;
    case "rewrite":
      return s.section_ref === "/summary" ? "Summary rewritten from what your CV already shows" : "Line rewritten from what your CV already shows";
    case "quantify":
      return `Metric added: ${s.user_text ?? ""}`;
    case "unverified_keyword":
      return `"${s.term}" added in your own words`;
    case "format":
      return s.section_ref.startsWith("/_style/") ? `Heading "${s.before_text}" renamed "${s.after_text}"` : s.after_text;
    case "hygiene":
      return s.section_ref === "/_format/dates" ? "Dates standardised to MMM YYYY" : `Spelling fixed`;
  }
}

const DEFAULT_STYLE: Style = {
  section_order: ["summary", "experience", "education", "skills"],
  heading_labels: {},
  font_class: "sans",
  accent_color: null,
  name_align: "left",
  bullet_style: "disc",
  source_columns: 1,
};

export function Export() {
  const { id } = useParams();
  const { profileId } = useOutletContext<LayoutContext>();
  const app = useApplication(id);
  const analysed = Boolean(app.data?.jd_terms && app.data.base_score);
  const suggestions = useSuggestions(id, analysed);
  const latest = useLatestExport(id);
  const generate = useGenerateExport();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [template, setTemplate] = useState<TemplateId>(() => {
    try {
      return getTemplate(localStorage.getItem(TEMPLATE_KEY)).id;
    } catch {
      return DEFAULT_TEMPLATE;
    }
  });
  function chooseTemplate(id: TemplateId) {
    setTemplate(id);
    try {
      localStorage.setItem(TEMPLATE_KEY, id);
    } catch {
      // Remembering the choice is a convenience only.
    }
  }

  const view = useMemo(() => {
    const a = app.data;
    if (!a?.jd_terms || !a.base_score || !a.cvs?.structured || !suggestions.data) return null;
    const cv = a.cvs.structured as StructuredCv;
    const ctx = { cv, jdTerms: a.jd_terms, base: a.base_score, roleTitle: a.role_title };
    const effective = suggestions.data.map((s) => (TEMPLATE_FIX.test(s.section_ref) ? { ...s, status: "accepted" as const } : s));
    const res = applyEdits(cv, effective);
    const projection = projectFromSuggestions(effective, ctx);
    const exportedText = cvText(res.cv);
    const missing = a.jd_terms.filter((t) => !termFound(t.term, t.synonyms, exportedText));
    const byTerm = new Map(suggestions.data.filter((s) => s.term).map((s) => [normaliseForMatch(s.term), s]));
    const gaps = missing.map((t) => {
      const s = byTerm.get(normaliseForMatch(t.term));
      const why = !s
        ? "no suggestion possible"
        : s.status === "skipped"
          ? s.type === "unverified_keyword"
            ? "skipped, no evidence"
            : "skipped"
          : s.status === "open"
            ? "not decided"
            : "accepted, but your wording leaves it out";
      return { term: t.term, must: t.importance === "must", why };
    });
    return {
      ctx,
      applied: res.applied,
      conflicts: res.conflicts,
      projection,
      gaps,
      preparedCv: res.cv,
      style: (a.cvs.style as Style | null) ?? DEFAULT_STYLE,
    };
  }, [app.data, suggestions.data]);

  if (app.isLoading || suggestions.isLoading) return <p className="text-muted">Loading…</p>;
  if (app.error || !app.data) return <p role="alert">This application could not be found.</p>;
  const a = app.data;
  if (!view) {
    return (
      <p>
        This application has not been analysed yet. <Link to={`/applications/${a.id}`}>Go to the analysis</Link>.
      </p>
    );
  }

  const done = generate.data;
  const last = latest.data;
  const after = done?.check.score.total ?? last?.final_score?.total;
  const fileName = done?.name ?? (last ? fileNameFromPath(last.storage_path) : null);
  const pages = (a.cvs?.parse_checks as { page_count?: number } | null)?.page_count;
  const appliedEdits = view.applied.filter((s) => !TEMPLATE_FIX.test(s.section_ref) || s.status === "accepted");
  const conflictIds = new Set(view.conflicts.map((c) => c.id));
  const conflicted = (suggestions.data ?? []).filter((s) => conflictIds.has(s.id));

  function onGenerate() {
    if (!view || !profileId) return;
    setDownloadError(null);
    generate.mutate({
      profileId,
      applicationId: a.id,
      roleTitle: a.role_title,
      company: a.company,
      style: view.style,
      ctx: view.ctx,
      suggestions: suggestions.data ?? [],
      pageCount: pages,
      spellingErrors: (a.base_score?.categories.hygiene.detail?.spelling_errors as string[] | undefined) ?? [],
      template,
    });
  }

  async function onDownload() {
    if (!last) return;
    setDownloadError(null);
    try {
      await downloadExport(last.storage_path);
    } catch (e) {
      setDownloadError((e as Error).message);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="text-sm text-muted">
          <Link to="/">Applications</Link> / {a.company || "Company not set"} / <Link to={`/applications/${a.id}`}>Suggestions</Link>
        </div>
        <h1 className="m-0 font-heading font-bold text-[32px] leading-tight">{after !== undefined ? "Tailored CV ready" : "Export"}</h1>
        <div className="text-muted">
          {a.role_title || "Untitled role"} · {a.company || "Company not set"}
        </div>
      </div>

      <section aria-label="Template" className={panel}>
        <TemplatePicker cv={view.preparedCv} style={view.style} value={template} onChange={chooseTemplate} />
      </section>

      <section aria-label="Download" className={`${panel} md:flex-row md:items-center md:justify-between gap-6`}>
        <div className="flex flex-wrap items-center gap-8">
          <div className="flex gap-8">
            <div>
              <div className="text-sm font-semibold text-muted">Before</div>
              <div className="font-heading font-bold text-5xl leading-none">{a.base_score!.total}</div>
            </div>
            <div>
              <div className="text-sm font-semibold text-muted">{after !== undefined ? "After" : "Projected"}</div>
              <div className="font-heading font-bold text-5xl leading-none text-accent-ink">{after ?? view.projection.total}</div>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="font-semibold break-all">{fileName ?? "Not generated yet"}</div>
            <div className="text-sm text-muted">
              {TEMPLATES[template].name} template · single column · editable in Word or Google Docs
              {last?.template && !done && last.template !== template && ` · last export used ${getTemplate(last.template).name}`}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" onClick={onGenerate} disabled={generate.isPending || !profileId}>
            {generate.isPending ? "Building…" : last || done ? "Generate again" : "Generate DOCX"}
          </Button>
          {last && !generate.isPending && <Button onClick={onDownload}>Download last export</Button>}
          <Link to={`/applications/${a.id}`}>Change decisions</Link>
        </div>
      </section>

      {generate.isError && (
        <p role="alert" className="m-0 rounded-[10px] bg-warn-tint text-warn-ink px-4 py-3">
          {(generate.error as Error).message}
        </p>
      )}
      {downloadError && (
        <p role="alert" className="m-0 rounded-[10px] bg-warn-tint text-warn-ink px-4 py-3">
          {downloadError}
        </p>
      )}
      {done && (
        <p role="status" className="m-0 text-sm text-muted">
          Downloaded {done.name}. Score recomputed from the document itself: {done.check.score.total} (the review screen projected{" "}
          {done.check.projected}).
          {done.check.defect && " The difference is more than 2 points, so it has been logged as a defect."}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="applied-h" className={panel}>
          <h2 id="applied-h" className="m-0 font-heading font-bold text-xl">
            {appliedEdits.length} {appliedEdits.length === 1 ? "edit" : "edits"} applied
          </h2>
          {appliedEdits.length === 0 && <p className="m-0 text-muted">No edits accepted. The export is your CV in the clean template.</p>}
          {appliedEdits.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-4 border-t border-border pt-3">
              <div className="min-w-0">
                <div className="font-medium">{describe(s)}</div>
                <div className="text-sm text-muted">
                  {TEMPLATE_FIX.test(s.section_ref) ? "Whole document" : sectionLabel(s.section_ref, view.ctx.cv)} · {TYPE_LABEL[s.type]}
                  {s.source === "user" && (s.type === "quantify" || s.type === "unverified_keyword") ? " · typed by you" : ""}
                  {s.edited_text ? " · your wording" : ""}
                </div>
              </div>
              <div className="font-semibold text-accent-ink tabular-nums">+{formatPoints(pointsFor(s, view.ctx, "effective"))}</div>
            </div>
          ))}
          {conflicted.length > 0 && (
            <div className="rounded-[10px] bg-warn-tint text-warn-ink px-4 py-3 text-sm">
              <strong>Not applied because of a conflict:</strong> {conflicted.map((s) => `${TYPE_LABEL[s.type]} on ${sectionLabel(s.section_ref, view.ctx.cv)}`).join("; ")}.
              A higher-ranked accepted edit changes the same text.
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-6">
          <section aria-labelledby="gaps-h" className={panel}>
            <h2 id="gaps-h" className="m-0 font-heading font-bold text-xl">
              Gaps left open
            </h2>
            {view.gaps.length ? (
              <>
                <p className="m-0 text-sm text-muted">The posting asks for these and the exported CV does not show them. Expect questions on them.</p>
                <ul className="m-0 pl-5 flex flex-col gap-1">
                  {view.gaps.map((g) => (
                    <li key={g.term}>
                      <span className="font-medium">{g.term}</span>
                      {g.must ? " (required)" : ""} · {g.why}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="m-0 text-muted">Every term in the posting appears in the exported CV.</p>
            )}
          </section>
          <section aria-labelledby="next-h" className={panel}>
            <h2 id="next-h" className="m-0 font-heading font-bold text-xl">
              Before you send it
            </h2>
            <ol className="m-0 pl-5 flex flex-col gap-1">
              <li>Open the file and read every changed line.</li>
              <li>Check it still fits {pages ? `${pages} ${pages === 1 ? "page" : "pages"}` : "the length you want"}.</li>
              <li>Save as PDF only if the portal asks for one.</li>
            </ol>
            <Link to="/">Back to applications</Link>
          </section>
        </aside>
      </div>
    </>
  );
}
