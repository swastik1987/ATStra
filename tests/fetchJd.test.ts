import { describe, expect, it } from "vitest";
import { FetchJdError, extractJob, runFetchJd, validateJobUrl } from "../supabase/functions/_shared/fetchJd.ts";

const LONG = "Own delivery reporting and pricing analysis with SQL, dbt and Looker. ".repeat(12);

const jsonLdPage = `<!doctype html><html><head><title>Senior Data Analyst - Tailwind Freight | Jobs</title>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "JobPosting",
  title: "Senior Data Analyst",
  hiringOrganization: { "@type": "Organization", name: "Tailwind Freight" },
  description: `<p>About the role</p><ul><li>${LONG}</li></ul>`,
})}</script>
<script>window.tracking = "should not appear";</script><style>.x{color:red}</style></head>
<body><nav>Home Jobs Login</nav><main><h1>Senior Data Analyst</h1><p>${LONG}</p></main><footer>Cookie policy</footer></body></html>`;

const plainPage = `<html><head><title>Data Analyst at Fabrikam</title><meta property="og:title" content="Data Analyst">
<meta property="og:site_name" content="Fabrikam Careers"></head>
<body><header>Menu</header><article><h1>Data Analyst</h1><p>${LONG}</p><p>Salary &amp; benefits &lt;competitive&gt;</p></article></body></html>`;

const loginPage = `<html><head><title>Sign in</title></head><body><form action="/session">
<input name="login"><input type="password" name="password"><button>Sign in</button></form>
<p>${LONG}</p></body></html>`;

function fakeFetch(responses: Record<string, { status: number; body?: string; type?: string; location?: string }>) {
  const seen: { url: string; init?: RequestInit }[] = [];
  const fn = async (url: string | URL | Request, init?: RequestInit) => {
    const key = String(url);
    seen.push({ url: key, init });
    const r = responses[key];
    if (!r) throw new TypeError("network down");
    const headers = new Headers({ "content-type": r.type ?? "text/html; charset=utf-8" });
    if (r.location) headers.set("location", r.location);
    // Response() refuses non-standard statuses such as LinkedIn's 999; real fetch can return them.
    if (r.status > 599) return { status: r.status, ok: false, headers, body: null } as unknown as Response;
    return new Response(r.body ?? "", { status: r.status, headers });
  };
  return { fn: fn as typeof fetch, seen };
}

describe("validateJobUrl", () => {
  it("accepts public https URLs", () => {
    expect(validateJobUrl("https://jobs.example.com/123").hostname).toBe("jobs.example.com");
  });

  it.each([
    "http://jobs.example.com/1",
    "ftp://example.com",
    "not a url",
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://10.0.0.5/x",
    "https://192.168.1.1/x",
    "https://172.20.0.1/x",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/x",
    "https://printer.local/x",
    "https://user:pass@example.com/x",
    "https://example.com:8443/x",
  ])("rejects %s as invalid_url", (url) => {
    expect(() => validateJobUrl(url)).toThrow(FetchJdError);
    try {
      validateJobUrl(url);
    } catch (e) {
      expect((e as FetchJdError).code).toBe("invalid_url");
    }
  });
});

describe("extractJob", () => {
  it("prefers JSON-LD JobPosting for text, title and company", () => {
    const job = extractJob(jsonLdPage);
    expect(job.title).toBe("Senior Data Analyst");
    expect(job.company).toBe("Tailwind Freight");
    expect(job.text).toContain("Own delivery reporting");
    expect(job.text).not.toContain("<");
    expect(job.text).not.toContain("tracking");
    expect(job.signInForm).toBe(false);
  });

  it("falls back to readable page text without nav, scripts or footer, decoding entities", () => {
    const job = extractJob(plainPage);
    expect(job.title).toBe("Data Analyst");
    expect(job.company).toBe("Fabrikam Careers");
    expect(job.text).toContain("Salary & benefits <competitive>");
    expect(job.text).not.toContain("Menu");
  });

  it("reads the company from a '... at Company' page title when nothing else names it", () => {
    const html = `<html><head><title>Job Application for Data Analyst at GitLab</title></head><body><main><p>${LONG}</p></main></body></html>`;
    expect(extractJob(html).company).toBe("GitLab");
  });

  it("detects a sign-in form", () => {
    expect(extractJob(loginPage).signInForm).toBe(true);
  });
});

describe("runFetchJd", () => {
  it("returns text, title and company for a public page, sending no cookies", async () => {
    const { fn, seen } = fakeFetch({ "https://jobs.example.com/1": { status: 200, body: jsonLdPage } });
    const res = await runFetchJd(fn, "https://jobs.example.com/1");
    expect(res).toMatchObject({ title: "Senior Data Analyst", company: "Tailwind Freight" });
    expect(res.text.length).toBeGreaterThanOrEqual(500);
    const headers = new Headers(seen[0].init?.headers);
    expect(headers.has("cookie")).toBe(false);
    expect(headers.has("authorization")).toBe(false);
    expect(seen[0].init?.redirect).toBe("manual");
  });

  it("returns login_wall for a sign-in form", async () => {
    const { fn } = fakeFetch({ "https://jobs.example.com/2": { status: 200, body: loginPage } });
    await expect(runFetchJd(fn, "https://jobs.example.com/2")).rejects.toMatchObject({ code: "login_wall" });
  });

  it("returns login_wall when readable text is under 500 characters", async () => {
    const { fn } = fakeFetch({ "https://jobs.example.com/3": { status: 200, body: "<html><body><p>Please enable JavaScript.</p></body></html>" } });
    await expect(runFetchJd(fn, "https://jobs.example.com/3")).rejects.toMatchObject({ code: "login_wall" });
  });

  it("returns login_wall on 401, 403 and LinkedIn's 999", async () => {
    for (const status of [401, 403, 999]) {
      const { fn } = fakeFetch({ "https://jobs.example.com/4": { status } });
      await expect(runFetchJd(fn, "https://jobs.example.com/4")).rejects.toMatchObject({ code: "login_wall" });
    }
  });

  it("follows redirects manually and treats a redirect to a login page as login_wall", async () => {
    const { fn } = fakeFetch({
      "https://jobs.example.com/5": { status: 302, location: "/login?next=/5" },
      "https://jobs.example.com/login?next=/5": { status: 200, body: plainPage },
    });
    await expect(runFetchJd(fn, "https://jobs.example.com/5")).rejects.toMatchObject({ code: "login_wall" });
  });

  it("refuses a redirect to http or a private address", async () => {
    const a = fakeFetch({ "https://jobs.example.com/6": { status: 301, location: "http://jobs.example.com/6" } });
    await expect(runFetchJd(a.fn, "https://jobs.example.com/6")).rejects.toMatchObject({ code: "invalid_url" });
    const b = fakeFetch({ "https://jobs.example.com/7": { status: 302, location: "https://127.0.0.1/admin" } });
    await expect(runFetchJd(b.fn, "https://jobs.example.com/7")).rejects.toMatchObject({ code: "invalid_url" });
  });

  it("returns fetch_failed on 404, network errors, non-HTML content and timeouts", async () => {
    const notFound = fakeFetch({ "https://jobs.example.com/8": { status: 404 } });
    await expect(runFetchJd(notFound.fn, "https://jobs.example.com/8")).rejects.toMatchObject({ code: "fetch_failed" });
    const down = fakeFetch({});
    await expect(runFetchJd(down.fn, "https://jobs.example.com/9")).rejects.toMatchObject({ code: "fetch_failed" });
    const pdf = fakeFetch({ "https://jobs.example.com/10": { status: 200, body: "%PDF", type: "application/pdf" } });
    await expect(runFetchJd(pdf.fn, "https://jobs.example.com/10")).rejects.toMatchObject({ code: "fetch_failed" });
    const slow = (async (_u: unknown, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as typeof fetch;
    await expect(runFetchJd(slow, "https://jobs.example.com/11", { timeoutMs: 50 })).rejects.toMatchObject({ code: "fetch_failed" });
  });

  it("reads at most the byte cap", async () => {
    const huge = `<html><body><main><p>${"word ".repeat(400_000)}</p></main></body></html>`;
    const { fn } = fakeFetch({ "https://jobs.example.com/12": { status: 200, body: huge } });
    const res = await runFetchJd(fn, "https://jobs.example.com/12", { maxBytes: 100_000 });
    expect(res.text.length).toBeLessThanOrEqual(100_000);
  });
});
