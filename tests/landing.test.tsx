// @vitest-environment jsdom
/**
 * The signed-out home page (ATStra landing): name, sign-in, required copy, and the SEO files
 * that index.html and public/ publish.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const auth = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(async () => ({ error: null })),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithOAuth: auth.signInWithOAuth,
    },
  },
}));

import { Landing } from "@/pages/Landing";
import { DISCLAIMER, FAQ } from "@/components/landing/content";

afterEach(cleanup);

function renderLanding(url = "/") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Landing />
    </MemoryRouter>,
  );
}

describe("landing page", () => {
  it("has one h1, the ATStra name and the fixed score disclaimer", async () => {
    renderLanding();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Tailor your CV to every job/);
    expect(screen.getAllByLabelText("ATStra home").length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain(DISCLAIMER);
  });

  it("starts Google sign-in from the hero button", async () => {
    renderLanding();
    const buttons = await screen.findAllByRole("button", { name: /Continue with Google/ });
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    await vi.waitFor(() => expect((buttons[0] as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(buttons[0]);
    expect(auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: "google" }));
  });

  it("shows the Gmail-only message when the sign-up hook rejected the account", () => {
    window.history.replaceState(null, "", "/?error_description=Only+gmail.com+accounts");
    renderLanding();
    expect(screen.getByRole("alert").textContent).toContain("Only Gmail accounts can use ATStra");
    window.history.replaceState(null, "", "/");
  });

  it("lists every FAQ question as a real disclosure", () => {
    renderLanding();
    expect(document.querySelectorAll("details > summary")).toHaveLength(FAQ.length);
  });

  it("uses no emoji", () => {
    renderLanding();
    expect(document.body.textContent).not.toMatch(/\p{Emoji_Presentation}/u);
  });
});

describe("SEO files", () => {
  const html = readFileSync("index.html", "utf8");

  it("publishes title, description, canonical, Open Graph and Twitter tags", () => {
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
    expect(title).toMatch(/^ATStra/);
    expect(title.length).toBeLessThanOrEqual(60);
    const desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1] ?? "";
    expect(desc.length).toBeGreaterThan(100);
    expect(desc.length).toBeLessThanOrEqual(160);
    expect(html).toContain('<link rel="canonical" href="https://atstra.pages.dev/" />');
    for (const p of ["og:title", "og:description", "og:image", "og:url"]) expect(html).toContain(`property="${p}"`);
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });

  it("keeps the FAQ structured data identical to the FAQ on the page", () => {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => JSON.parse(m[1]));
    const faq = blocks.find((b: { "@type": string }) => b["@type"] === "FAQPage");
    expect(faq.mainEntity.map((q: { name: string; acceptedAnswer: { text: string } }) => [q.name, q.acceptedAnswer.text])).toEqual(
      FAQ.map((f) => [f.q, f.a]),
    );
  });

  it("ships every file the head points to", () => {
    for (const f of ["favicon.svg", "apple-touch-icon.png", "og-image.png", "site.webmanifest", "icon-192.png", "icon-512.png", "robots.txt", "sitemap.xml"]) {
      expect(existsSync(join("public", f)), f).toBe(true);
    }
    const png = readFileSync("public/og-image.png");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(readFileSync("public/robots.txt", "utf8")).toContain("Sitemap: https://atstra.pages.dev/sitemap.xml");
  });

  it("no longer calls the app CV Tailor", () => {
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)]));
    const hits = [...files("src"), "index.html"].filter((f) => /\.(tsx?|html|css)$/.test(f) && readFileSync(f, "utf8").includes("CV Tailor"));
    expect(hits).toEqual([]);
  });
});
