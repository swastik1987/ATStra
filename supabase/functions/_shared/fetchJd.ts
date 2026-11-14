/**
 * Core of fetch-jd (CLAUDE.md section 8): best-effort fetch of a public job page.
 * HTTPS only, public hosts only, 10 s timeout, 1 MB cap, no cookies, never gets around a
 * login. Pure apart from the injected fetch, so it is unit-tested in Vitest.
 */

export type FetchJdErrorCode = "invalid_url" | "fetch_failed" | "login_wall" | "too_short";

export class FetchJdError extends Error {
  constructor(
    public readonly code: FetchJdErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FetchJdError";
  }
}

export const MIN_READABLE_CHARS = 500;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;
const LOGIN_PATH = /\/(login|log-in|signin|sign-in|sign_in|auth|authwall|session|accounts?\/login|uas\/login)(\/|\?|$)/i;

const MESSAGES = {
  invalid_url: "Use a full https:// link to a public job posting.",
  fetch_failed: "Could not read this page. Paste the job description instead.",
  login_wall: "This posting needs a sign-in. Copy the text and paste it instead.",
};

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") && !h.includes(":")) {
    return true;
  }
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  if (h.includes(":")) {
    return h === "::1" || h === "::" || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith("::ffff:");
  }
  return false;
}

export function validateJobUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new FetchJdError("invalid_url", MESSAGES.invalid_url);
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || isPrivateHost(url.hostname)) {
    throw new FetchJdError("invalid_url", MESSAGES.invalid_url);
  }
  return url;
}

// ---------- HTML to text ----------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",ndash: "-", mdash: "-", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', bull: "•", hellip: "..." };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<\/(p|div|section|article|li|ul|ol|h[1-6]|tr|table|main)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pick(html: string, re: RegExp): string {
  const m = html.match(re);
  return m ? decode(m[1]).trim() : "";
}

interface JobPosting {
  title?: string;
  description?: string;
  hiringOrganization?: { name?: string } | string;
}

function findJobPosting(html: string): JobPosting | null {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, raw] of blocks) {
    try {
      const data = JSON.parse(raw.trim());
      const nodes: unknown[] = Array.isArray(data) ? data : data?.["@graph"] ? data["@graph"] : [data];
      for (const n of nodes) {
        const type = (n as { "@type"?: string | string[] })?.["@type"];
        if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return n as JobPosting;
      }
    } catch {
      // Ignore malformed JSON-LD.
    }
  }
  return null;
}

export interface ExtractedJob {
  text: string;
  title: string;
  company: string;
  signInForm: boolean;
}

export function extractJob(html: string): ExtractedJob {
  const signInForm = /<input\b[^>]*type=["']?password/i.test(html);
  const posting = findJobPosting(html);
  const org = posting?.hiringOrganization;
  const pageTitle = pick(html, /<title[^>]*>([^<]+)<\/title>/i);
  const company =
    (typeof org === "string" ? org : org?.name)?.trim() ||
    pick(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i) ||
    (pageTitle.match(/\bat\s+([^|–-]{2,60}?)\s*(?:[|–-].*)?$/i)?.[1] ?? "").trim();
  const title =
    posting?.title?.trim() ||
    pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) ||
    pick(html, /<title[^>]*>([^<]+)<\/title>/i);

  let text = posting?.description ? htmlToText(decode(posting.description)) : "";
  if (text.length < MIN_READABLE_CHARS) {
    const main = html.match(/<(main|article)\b[\s\S]*?<\/\1>/i)?.[0];
    const body = html.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? html;
    const mainText = main ? htmlToText(main) : "";
    text = mainText.length >= MIN_READABLE_CHARS ? mainText : htmlToText(body);
  }
  if (title && text && !text.toLowerCase().startsWith(title.toLowerCase())) text = `${title}\n\n${text}`;
  return { text, title, company: company ?? "", signInForm };
}

// ---------- fetch ----------

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - size;
    chunks.push(value.length > room ? value.subarray(0, room) : value);
    size += Math.min(value.length, room);
  }
  await reader.cancel().catch(() => {});
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(all);
}

export interface FetchJdResult {
  text: string;
  title: string;
  company: string;
}

export async function runFetchJd(
  fetchFn: typeof fetch,
  rawUrl: string,
  opts: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<FetchJdResult> {
  let url = validateJobUrl(rawUrl);
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      try {
        // No cookies, no credentials, no user data: only a generic browser-like request.
        res = await fetchFn(url.toString(), {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; CVTailor/1.0; job-description fetch)",
            Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
            "Accept-Language": "en",
          },
        });
      } catch {
        throw new FetchJdError("fetch_failed", MESSAGES.fetch_failed);
      }
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) throw new FetchJdError("fetch_failed", MESSAGES.fetch_failed);
        url = validateJobUrl(new URL(location, url).toString());
        if (LOGIN_PATH.test(url.pathname + url.search)) throw new FetchJdError("login_wall", MESSAGES.login_wall);
        continue;
      }
      break;
    }
    if (!res || (res.status >= 300 && res.status < 400)) throw new FetchJdError("fetch_failed", MESSAGES.fetch_failed);
    if (res.status === 401 || res.status === 403 || res.status === 999) throw new FetchJdError("login_wall", MESSAGES.login_wall);
    if (!res.ok) throw new FetchJdError("fetch_failed", MESSAGES.fetch_failed);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) throw new FetchJdError("fetch_failed", MESSAGES.fetch_failed);

    let body: string;
    try {
      body = await readCapped(res, maxBytes);
    } catch {
      throw new FetchJdError("fetch_failed", MESSAGES.fetch_failed);
    }
    const job = /text\/plain/i.test(type) ? { text: body.trim(), title: "", company: "", signInForm: false } : extractJob(body);
    if (job.signInForm || job.text.length < MIN_READABLE_CHARS) throw new FetchJdError("login_wall", MESSAGES.login_wall);
    return { text: job.text.slice(0, maxBytes), title: job.title, company: job.company };
  } finally {
    clearTimeout(timer);
  }
}
