/**
 * Browser-side PDF text extraction (CLAUDE.md F5, F10, section 4 parse safety).
 *
 * Works with either pdfjs build: the browser passes `pdfjs-dist`, tests pass the legacy
 * build. Text is returned in pdf.js content order, which is what a simple ATS parser sees.
 */

export const MIN_TEXT_CHARS = 200;
export const MAX_PDF_BYTES = 5 * 1024 * 1024;

/** Share of page height at the top and bottom treated as the header/footer region. */
const EDGE_REGION = 0.04;

export interface BrowserChecks {
  text_extractable: boolean;
  single_column: boolean;
  header_footer_clear: boolean;
}

export interface PdfExtraction {
  text: string;
  pageCount: number;
  isScanned: boolean;
  checks: BrowserChecks;
}

interface Item {
  str: string;
  x0: number;
  x1: number;
  y: number;
  h: number;
}

interface PageLayout {
  width: number;
  height: number;
  items: Item[];
}

/** Minimal shape of the pdfjs module we use; both builds satisfy it. */
export interface PdfjsLike {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean; verbosity?: number }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        view: number[];
        getTextContent(): Promise<{ items: unknown[] }>;
      }>;
    }>;
    destroy(): Promise<void>;
  };
}

function toItem(raw: unknown): Item | null {
  const it = raw as { str?: string; transform?: number[]; width?: number; height?: number };
  if (typeof it.str !== "string" || !it.transform) return null;
  const [, , , d, e, f] = it.transform;
  return { str: it.str, x0: e, x1: e + (it.width ?? 0), y: f, h: it.height || Math.abs(d) || 10 };
}

/** Joins items into lines: a new line whenever the baseline moves. */
function pageText(items: Item[]): string {
  let out = "";
  let lastY: number | null = null;
  let lastX1 = 0;
  for (const it of items) {
    if (lastY !== null && Math.abs(it.y - lastY) > Math.max(2, it.h * 0.4)) {
      out += "\n";
    } else if (lastY !== null && it.str && !out.endsWith(" ") && !it.str.startsWith(" ") && it.x0 - lastX1 > 1) {
      out += " ";
    }
    out += it.str;
    if (it.str.trim()) {
      lastY = it.y;
      lastX1 = it.x1;
    }
  }
  return out.replace(/[ \t]+\n/g, "\n").trim();
}

/**
 * Multi-column if some vertical line between 20% and 80% of the page width is crossed by
 * (almost) no text, has a real share of text on both sides, and both sides run alongside
 * each other vertically. Right-aligned dates do not trigger it: full-width bullets cross.
 */
function isMultiColumn(page: PageLayout): boolean {
  const items = page.items.filter((i) => i.str.trim() && i.x1 > i.x0);
  if (items.length < 8) return false;
  const total = items.reduce((n, i) => n + i.str.length, 0);
  const allowedCrossings = Math.max(1, Math.floor(items.length * 0.02));
  for (let f = 0.2; f <= 0.8; f += 0.01) {
    const cx = page.width * f;
    const crossing = items.filter((i) => i.x0 < cx - 1 && i.x1 > cx + 1).length;
    if (crossing > allowedCrossings) continue;
    const left = items.filter((i) => i.x1 <= cx + 1);
    const right = items.filter((i) => i.x0 >= cx - 1);
    const chars = (xs: Item[]) => xs.reduce((n, i) => n + i.str.length, 0);
    if (chars(left) < total * 0.08 || chars(right) < total * 0.08) continue;
    const span = (xs: Item[]) => [Math.min(...xs.map((i) => i.y)), Math.max(...xs.map((i) => i.y))];
    const [l0, l1] = span(left);
    const [r0, r1] = span(right);
    const overlap = Math.min(l1, r1) - Math.max(l0, r0);
    const shorter = Math.min(l1 - l0, r1 - r0);
    if (shorter > 0 && overlap / shorter >= 0.5) return true;
  }
  return false;
}

function hasEdgeText(page: PageLayout): boolean {
  const top = page.height * (1 - EDGE_REGION);
  const bottom = page.height * EDGE_REGION;
  return page.items.some((i) => i.str.trim() && (i.y > top || i.y + i.h < bottom));
}

export async function extractPdfText(lib: PdfjsLike, data: Uint8Array): Promise<PdfExtraction> {
  // verbosity 0: font-data warnings do not affect text extraction.
  const task = lib.getDocument({ data, isEvalSupported: false, useSystemFonts: false, verbosity: 0 });
  try {
    const doc = await task.promise;
    const pages: PageLayout[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const [x0, y0, x1, y1] = page.view;
      pages.push({
        width: x1 - x0,
        height: y1 - y0,
        items: content.items.map(toItem).filter((i): i is Item => i !== null),
      });
    }
    const text = pages.map((p) => pageText(p.items)).join("\n\n");
    const extractable = text.replace(/\s/g, "").length >= MIN_TEXT_CHARS;
    return {
      text,
      pageCount: doc.numPages,
      isScanned: !extractable,
      checks: {
        text_extractable: extractable,
        single_column: extractable && !pages.some(isMultiColumn),
        header_footer_clear: !pages.some(hasEdgeText),
      },
    };
  } finally {
    await task.destroy();
  }
}

/** Lazy-loads pdfjs in the browser so it stays out of the main bundle. */
export async function extractPdfInBrowser(file: File): Promise<PdfExtraction> {
  const [lib, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  lib.GlobalWorkerOptions.workerSrc = worker.default;
  return extractPdfText(lib as unknown as PdfjsLike, new Uint8Array(await file.arrayBuffer()));
}

export { normaliseForMatch } from "../../supabase/functions/_shared/text.ts";
