// @vitest-environment jsdom
/** The AI credits figure next to the user's name in the header. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc, auth: { signOut: vi.fn() } },
}));

import { formatCredits } from "@/lib/credits";
import { AppHeader } from "@/components/AppHeader";

afterEach(cleanup);

describe("formatCredits", () => {
  it("shows one decimal under 10, whole numbers above, with thousands separators", () => {
    expect(formatCredits(0)).toBe("0");
    expect(formatCredits(0.04)).toBe("0.1");
    expect(formatCredits(3.26)).toBe("3.3");
    expect(formatCredits(12.4)).toBe("12");
    expect(formatCredits(1239.6)).toBe("1,240");
  });
});

describe("header credits", () => {
  function renderHeader() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <AppHeader displayName="Alex Morgan" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("shows the approximate cumulative credits next to the name, with the month in the description", async () => {
    rpc.mockResolvedValue({ data: [{ total_credits: 42.6, month_credits: 7.2, calls: 9 }], error: null });
    renderHeader();
    const badge = await screen.findByText(/43 AI credits/);
    expect(badge.textContent).toContain("≈");
    expect(rpc).toHaveBeenCalledWith("my_usage");
    const holder = badge.closest("[title]");
    expect(holder?.getAttribute("title")).toMatch(/7\.2 this month/);
    expect(holder?.getAttribute("title")).toMatch(/1 credit is about US\$0\.01/);
  });

  it("hides the figure when it cannot be loaded, and never blocks the header", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "nope" } });
    renderHeader();
    expect(screen.getByText("Alex Morgan")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/AI credits/)).toBeNull();
  });
});
