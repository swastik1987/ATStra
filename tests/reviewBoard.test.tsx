// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ReviewBoard } from "../src/components/ReviewBoard.tsx";
import type { Suggestion } from "../src/lib/applyEdits.ts";
import { METRIC } from "../supabase/functions/_shared/validate.ts";
import { scoreCv } from "../supabase/functions/_shared/scoring.ts";
import { fixtureCv, fixtureTerms } from "./fixtures/suggestionContext.ts";

const cv = fixtureCv();
const jdTerms = fixtureTerms();
const base = scoreCv({ cv, pageCount: 1, parseChecks: undefined, jdTerms, roleTitle: "Senior Data Analyst", spellingErrors: [] });
const ctx = { cv, jdTerms, base, roleTitle: "Senior Data Analyst" };

const suggestions: Suggestion[] = [
  {
    id: "k1",
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
  },
  {
    id: "q1",
    type: "quantify",
    category: "evidence_impact",
    section_ref: "/experience/1/bullets/0",
    before_text: cv.experience[1].bullets[0],
    after_text: `Owned the stock availability report for 120 stores, cutting stock-outs by ${METRIC}`,
    evidence_quote: "",
    points: 4,
    status: "open",
    user_text: null,
    edited_text: null,
    rank: 2,
    term: "",
    source: "model",
    confirmed: false,
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup() {
  // Persistence never resolves: the score must not wait for it.
  const persist = vi.fn(() => new Promise<void>(() => {}));
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  render(<ReviewBoard suggestions={suggestions} ctx={ctx} persist={persist} />);
  return { persist, fetchSpy };
}

const projected = () => Number(screen.getByTestId("projected-total").textContent);

describe("review board", () => {
  it("accepting and undoing a card changes the projected score at once, with no network call", () => {
    const { persist, fetchSpy } = setup();
    const start = projected();
    expect(start).toBe(base.total);

    const card = screen.getByRole("article", { name: /A\/B testing/ });
    act(() => fireEvent.click(within(card).getByRole("button", { name: "Accept" })));
    const afterAccept = projected();
    expect(afterAccept).toBeGreaterThan(start);
    expect(within(card).getByText("Accepted")).toBeTruthy();

    act(() => fireEvent.click(within(card).getByRole("button", { name: "Undo accept" })));
    expect(projected()).toBe(start);

    act(() => fireEvent.click(within(card).getByRole("button", { name: "Skip" })));
    expect(projected()).toBe(start);
    expect(within(card).getByText("Skipped")).toBeTruthy();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledWith("k1", { status: "accepted" });
    expect(persist).toHaveBeenLastCalledWith("k1", { status: "skipped" });
  });

  it("F13: Quantify cannot be accepted until a metric is typed", () => {
    const { persist } = setup();
    const card = screen.getByRole("article", { name: /Quantify/ });
    const accept = within(card).getByRole("button", { name: "Accept" }) as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
    act(() => fireEvent.change(within(card).getByLabelText(/metric/i), { target: { value: "18%" } }));
    expect(accept.disabled).toBe(false);
    const before = projected();
    act(() => fireEvent.click(accept));
    expect(projected()).toBeGreaterThan(before);
    expect(persist).toHaveBeenCalledWith("q1", expect.objectContaining({ user_text: "18%", source: "user" }));
  });

  it("has no accept-all control", () => {
    setup();
    expect(screen.queryByRole("button", { name: /accept all/i })).toBeNull();
  });
});
