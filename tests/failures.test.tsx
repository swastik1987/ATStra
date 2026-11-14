// @vitest-environment jsdom
/**
 * CLAUDE.md section 10: each failure is reproduced and shows its message.
 * The Supabase client and the edge-function caller are replaced with in-memory fakes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";

const fake = vi.hoisted(() => {
  const tables: Record<string, unknown> = {};
  const upload = vi.fn(async () => ({ data: { path: "x" }, error: null }));
  const callFunction = vi.fn();
  const extract = vi.fn();
  function query(table: string) {
    const result = () => ({ data: tables[table] ?? null, error: null, count: 0 });
    const q: unknown = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then") return (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad);
        return () => q;
      },
    });
    return q;
  }
  return { tables, upload, callFunction, extract, query };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (t: string) => fake.query(t),
    storage: { from: () => ({ upload: fake.upload, remove: vi.fn(async () => ({ error: null })) }) },
    rpc: vi.fn(async () => ({ error: null })),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("@/lib/functions", async () => {
  class FunctionError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { FunctionError, callFunction: fake.callFunction };
});

vi.mock("@/lib/pdfText", async (orig) => ({
  ...(await orig<typeof import("../src/lib/pdfText.ts")>()),
  extractPdfInBrowser: fake.extract,
}));

import { FunctionError } from "@/lib/functions";
import { MasterCvCard } from "../src/components/MasterCvCard.tsx";
import { NewTailoring } from "../src/pages/NewTailoring.tsx";
import { Analysis } from "../src/pages/Analysis.tsx";
import { ReviewBoard } from "../src/components/ReviewBoard.tsx";
import { scoreCv } from "../src/lib/scoring.ts";
import { fixtureCv, fixtureTerms } from "./fixtures/suggestionContext.ts";

function renderAt(path: string, routePath: string, element: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Outlet context={{ profileId: "profile-1" }} />}>
            <Route path={routePath} element={element} />
            <Route path="*" element={<p>elsewhere</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const k of Object.keys(fake.tables)) delete fake.tables[k];
  fake.upload.mockClear();
  fake.callFunction.mockReset();
  fake.extract.mockReset();
});
afterEach(cleanup);

const cv = fixtureCv();

describe("section 10 failures", () => {
  it("PDF with no extractable text: scanned message, upload not saved", async () => {
    fake.extract.mockResolvedValue({ text: "", pageCount: 1, isScanned: true, checks: {} });
    const { container } = renderAt("/", "/", <MasterCvCard profileId="profile-1" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["%PDF"], "scan.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByText(/This PDF looks scanned\. Upload a text-based PDF\./)).toBeTruthy();
    expect(fake.upload).not.toHaveBeenCalled();
    expect(fake.callFunction).not.toHaveBeenCalled();
  });

  it("job link behind a login: inline message on the Job link tab and a prompt to paste", async () => {
    fake.callFunction.mockRejectedValue(new FunctionError("login_wall", "This posting needs a sign-in. Copy the text and paste it instead."));
    renderAt("/new", "/new", <NewTailoring />);
    fireEvent.click(screen.getByRole("button", { name: "Job link" }));
    fireEvent.change(screen.getByLabelText("Job posting URL"), { target: { value: "https://www.linkedin.com/jobs/view/1" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch posting" }));
    expect(await screen.findByText(/Could not read this page\./)).toBeTruthy();
    expect(screen.getByText(/needs a sign-in/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Paste text" }));
    expect(screen.getByLabelText("Job description text")).toBeTruthy();
  });

  const draftApp = () => ({
    id: "app-1",
    role_title: "Senior Data Analyst",
    company: "Tailwind Freight",
    jd_source: "text",
    jd_text: "x".repeat(400),
    jd_terms: null,
    base_score: null,
    status: "draft",
    outcome: "not_applied",
    updated_at: new Date().toISOString(),
    prompt_version: null,
    cv_id: "cv-1",
    cvs: { id: "cv-1", file_name: "cv.pdf", structured: cv, style: null, parse_checks: null, is_master: true },
  });

  it("model call fails or times out: Retry button, inputs kept", async () => {
    fake.tables.applications = draftApp();
    fake.callFunction.mockRejectedValue(new FunctionError("model_error", "Analysis failed. Try again."));
    renderAt("/applications/app-1", "/applications/:id", <Analysis />);
    expect(await screen.findByText("Analysis failed. Try again.")).toBeTruthy();
    expect(screen.getByText(/Your CV and job description are saved\./)).toBeTruthy();
    fake.callFunction.mockRejectedValue(new FunctionError("model_error", "Analysis failed. Try again."));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fake.callFunction).toHaveBeenCalledTimes(2));
    expect(fake.callFunction).toHaveBeenLastCalledWith("analyse", { application_id: "app-1" });
  });

  it("model output fails validation twice: 'Analysis failed. Try again.'", async () => {
    fake.tables.applications = draftApp();
    fake.callFunction.mockRejectedValue(new FunctionError("schema_invalid", "Analysis failed. Try again."));
    renderAt("/applications/app-1", "/applications/:id", <Analysis />);
    expect(await screen.findByText("Analysis failed. Try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("daily cap reached: the cap message and no Retry", async () => {
    fake.tables.applications = draftApp();
    fake.callFunction.mockRejectedValue(new FunctionError("daily_cap", "Daily analysis limit reached. Try again tomorrow."));
    renderAt("/applications/app-1", "/applications/:id", <Analysis />);
    expect(await screen.findByText("Daily analysis limit reached. Try again tomorrow.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("all suggestions dropped by validation: score and terms shown with 'No safe edits found'", () => {
    const jdTerms = fixtureTerms();
    const base = scoreCv({ cv, pageCount: 1, parseChecks: undefined, jdTerms, roleTitle: "Senior Data Analyst", spellingErrors: [] });
    render(<ReviewBoard suggestions={[]} ctx={{ cv, jdTerms, base, roleTitle: "Senior Data Analyst" }} persist={async () => {}} />);
    expect(screen.getByText("No safe edits found")).toBeTruthy();
    expect(screen.getByTestId("current-total").textContent).toBe(String(base.total));
    expect(screen.getByRole("heading", { name: "Job description terms" })).toBeTruthy();
  });
});
