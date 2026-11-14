/**
 * Development-only preview of the real screens with synthetic fixture data, for layout checks
 * (phase 5 phone-width check). No sign-in and no network: the query cache is pre-filled and
 * never refetches. Registered only when import.meta.env.DEV, so it is not in the production build.
 * Open /__preview?page=applications|new|analysis|export|cv
 */
import { useMemo, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Route, Routes, useSearchParams } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { Applications } from "@/pages/Applications";
import { NewTailoring } from "@/pages/NewTailoring";
import { Analysis } from "@/pages/Analysis";
import { Export } from "@/pages/Export";
import { CvText } from "@/pages/CvText";
import { scoreCv } from "@/lib/scoring";
import { METRIC, type Suggestion } from "@/lib/applyEdits";
import { fixtureCv, fixtureTerms } from "../../tests/fixtures/suggestionContext.ts";

// Nested under the /__preview/* route: paths are relative, locations keep the prefix.
const PAGES: Record<string, { path: string; location: string; element: ReactElement }> = {
  applications: { path: "home", location: "/__preview/home", element: <Applications /> },
  new: { path: "new", location: "/__preview/new", element: <NewTailoring /> },
  analysis: { path: "applications/:id", location: "/__preview/applications/app-1", element: <Analysis /> },
  export: { path: "applications/:id/export", location: "/__preview/applications/app-1/export", element: <Export /> },
  cv: { path: "cv/:id", location: "/__preview/cv/cv-1", element: <CvText /> },
};

function seededClient(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchOnMount: false } } });
  const cv = fixtureCv();
  const jdTerms = fixtureTerms();
  const checks = {
    text_extractable: { pass: true, label: "Text can be extracted" },
    single_column: { pass: false, label: "2 columns: exported as one column" },
    standard_headings: { pass: true, label: "Standard section headings", nonstandard: [] },
    header_footer_clear: { pass: true, label: "No text in header or footer" },
    no_tables_or_text_boxes: { pass: true, label: "No tables or text boxes" },
  };
  const base = scoreCv({ cv, pageCount: 1, parseChecks: checks, jdTerms, roleTitle: "Senior Data Analyst", spellingErrors: [] });
  const style = {
    section_order: ["summary", "experience", "education", "skills"],
    heading_labels: { summary: "Summary", experience: "Experience", education: "Education", skills: "Skills" },
    font_class: "sans" as const,
    accent_color: "#1F3A5F",
    name_align: "left" as const,
    bullet_style: "disc",
    source_columns: 2,
  };
  const cvRow = {
    id: "cv-1",
    file_name: "Alex_Morgan_CV_with_a_rather_long_file_name.pdf",
    storage_path: "p/cv.pdf",
    raw_text: `Alex Morgan\nSenior Data Analyst\nSummary\n${cv.summary}\nExperience\n${cv.experience.flatMap((r) => [r.title, ...r.bullets]).join("\n")}`,
    structured: cv,
    style,
    parse_checks: { page_count: 2, checks, transcription: { unmatched: [] } },
    is_master: true,
    created_at: new Date().toISOString(),
  };
  const s = (over: Partial<Suggestion>): Suggestion => ({
    id: "s",
    type: "keyword",
    category: "keyword_coverage",
    section_ref: "/experience/0/bullets/2",
    before_text: cv.experience[0].bullets[2],
    after_text: "Ran A/B testing on routing changes with the operations team",
    evidence_quote: "Ran split tests on routing changes",
    points: 7.78,
    status: "open",
    user_text: null,
    edited_text: null,
    rank: 1,
    term: "A/B testing",
    source: "model",
    confirmed: false,
    ...over,
  });
  const suggestions: Suggestion[] = [
    s({ id: "s1", status: "accepted" }),
    s({
      id: "s2",
      type: "quantify",
      category: "evidence_impact",
      section_ref: "/experience/1/bullets/0",
      before_text: cv.experience[1].bullets[0],
      after_text: `Owned the stock availability report for 120 stores, cutting stock-outs by ${METRIC}`,
      evidence_quote: "",
      term: "",
      points: 4,
      rank: 2,
    }),
    s({ id: "s3", type: "unverified_keyword", section_ref: "/skills", before_text: "", after_text: "", evidence_quote: "", term: "Snowflake", points: 3.89, rank: 3 }),
    s({
      id: "s4",
      type: "format",
      category: "parse_safety",
      section_ref: "/_format/single_column",
      before_text: "Multi-column layout",
      after_text: "Exported as a single column, so it is read in the right order",
      evidence_quote: "",
      term: "",
      points: 4,
      rank: 4,
    }),
  ];
  const now = new Date().toISOString();
  const app = {
    id: "app-1",
    role_title: "Senior Data Analyst",
    company: "Tailwind Freight",
    jd_source: "url",
    jd_url: "https://jobs.example.com/1",
    jd_text: "synthetic",
    jd_terms: jdTerms,
    base_score: base,
    status: "reviewing",
    outcome: "applied",
    outcome_updated_at: now,
    updated_at: now,
    prompt_version: "analyse.v3",
    cv_id: "cv-1",
    cvs: cvRow,
  };
  const exportRow = {
    id: "e1",
    storage_path: "p/app-1/1-Alex-Morgan_Senior-Data-Analyst_Tailwind-Freight.docx",
    final_score: { ...base, total: base.total + 12, projected: base.total + 12, diff: 0, defect: false },
    applied_suggestion_ids: ["s1"],
    created_at: now,
  };
  client.setQueryData(["applications"], [
    { ...app, exports: [exportRow] },
    { ...app, id: "app-2", role_title: "Data Analyst", company: "Contoso Analytics Group Ltd", jd_source: "text", outcome: "not_applied", status: "draft", base_score: null, exports: [] },
  ]);
  client.setQueryData(["applications", "app-1"], app);
  client.setQueryData(["suggestions", "app-1"], suggestions);
  client.setQueryData(["usage"], { total_credits: 16.9, month_credits: 16.9, calls: 3 });
  client.setQueryData(["exports", "app-1"], exportRow);
  client.setQueryData(["cv", "master"], cvRow);
  client.setQueryData(["cv", "cv-1"], cvRow);
  return client;
}

export function PhonePreview() {
  const [params] = useSearchParams();
  const page = PAGES[params.get("page") ?? "applications"] ?? PAGES.applications;
  const client = useMemo(() => seededClient(), []);
  return (
    <QueryClientProvider client={client}>
      <div className="min-h-screen">
        <AppHeader displayName="Alex Morgan" />
        <main className="max-w-[1180px] mx-auto px-4 sm:px-8 pt-9 pb-16 flex flex-col gap-7">
          <Routes location={page.location}>
            <Route element={<Outlet context={{ profileId: "profile-1" }} />}>
              <Route path={page.path} element={page.element} />
            </Route>
          </Routes>
        </main>
      </div>
    </QueryClientProvider>
  );
}
