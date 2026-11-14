import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { MIN_TEXT_CHARS, extractPdfText, normaliseForMatch } from "../src/lib/pdfText.ts";

const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}`));
const content = JSON.parse(readFileSync("tests/fixtures/cv-content.json", "utf8"));
const allBullets: string[] = content.experience.flatMap((r: { bullets: string[] }) => r.bullets);

describe("browser PDF extraction", () => {
  it("rejects the scanned fixture: under 200 characters of text", async () => {
    const res = await extractPdfText(pdfjs, fixture("cv-scanned.pdf"));
    expect(res.text.trim().length).toBeLessThan(MIN_TEXT_CHARS);
    expect(res.isScanned).toBe(true);
    expect(res.checks.text_extractable).toBe(false);
  });

  it("reads the single-column fixture as single column with every bullet present", async () => {
    const res = await extractPdfText(pdfjs, fixture("cv-single-column.pdf"));
    expect(res.isScanned).toBe(false);
    expect(res.pageCount).toBe(1);
    expect(res.checks).toEqual({ text_extractable: true, single_column: true, header_footer_clear: true });
    const text = normaliseForMatch(res.text);
    for (const b of allBullets) expect(text, b).toContain(normaliseForMatch(b));
  });

  it("flags the two-column fixture as multi-column", async () => {
    const res = await extractPdfText(pdfjs, fixture("cv-two-column.pdf"));
    expect(res.isScanned).toBe(false);
    expect(res.checks.single_column).toBe(false);
    expect(res.checks.text_extractable).toBe(true);
    const text = normaliseForMatch(res.text);
    for (const b of allBullets) expect(text, b).toContain(normaliseForMatch(b));
  });

  it("flags text in the header or footer region", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText("Page header text", { x: 57, y: 825, size: 9, font });
    for (let i = 0; i < 20; i++) {
      page.drawText(`Body line ${i} with enough words to count as a real line of CV text here`, { x: 57, y: 760 - i * 16, size: 10, font });
    }
    const res = await extractPdfText(pdfjs, new Uint8Array(await doc.save()));
    expect(res.checks.header_footer_clear).toBe(false);
    expect(res.checks.single_column).toBe(true);
  });

  it("puts each line on its own line, in content order", async () => {
    const res = await extractPdfText(pdfjs, fixture("cv-single-column.pdf"));
    const lines = res.text.split("\n").map((l) => l.trim()).filter(Boolean);
    expect(lines[0]).toBe("Alex Morgan");
    expect(lines.indexOf("Summary")).toBeLessThan(lines.indexOf("Experience"));
  });
});

describe("normaliseForMatch", () => {
  it("joins hyphenated line breaks, collapses whitespace, lowercases, drops bullet glyphs", () => {
    expect(normaliseForMatch("• Cut  reconcili-\nation\nTime")).toBe("cut reconciliation time");
  });
});
