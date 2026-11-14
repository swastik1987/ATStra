/**
 * Reads a generated DOCX back into paragraphs and rebuilds the structured CV from it, so the
 * score can be recomputed from the document itself (CLAUDE.md sections 4 and 9).
 * Works in the browser and in Node: plain string parsing, no DOM needed.
 */
import JSZip from "jszip";
import type { StructuredCv } from "../../../supabase/functions/_shared/parseCv.ts";
import { STYLE_IDS } from "./build";

export interface DocxParagraph {
  style: string;
  list: boolean;
  runs: string[];
  text: string;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

export function paragraphsFromXml(xml: string): DocxParagraph[] {
  const out: DocxParagraph[] = [];
  for (const [, inner] of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const pPr = inner.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)?.[1] ?? "";
    const style = pPr.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "Normal";
    const list = /<w:numPr>/.test(pPr);
    const runs = [...inner.matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)].map(([, r]) =>
      [...r.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>/g)].map((m) => (m[0] === "<w:tab/>" ? "\t" : decode(m[1] ?? ""))).join(""),
    );
    const text = runs.join("");
    // Headings may end with a tab whose leader draws a rule (Terminal template); it is not text.
    out.push({ style, list, runs, text: style === "Heading1" ? text.replace(/\t+$/, "") : text });
  }
  return out;
}

export async function readDocx(bytes: Uint8Array | ArrayBuffer): Promise<DocxParagraph[]> {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("Not a DOCX file: word/document.xml is missing");
  return paragraphsFromXml(xml);
}

function parseContact(line: string): StructuredCv["contact"] {
  // Templates separate contact items with " | " or " · " surrounded by spaces.
  const parts = line.split(/\s+[|·]\s+/).map((p) => p.trim()).filter(Boolean);
  const email = parts.find((p) => /\S+@\S+\.\S+/.test(p)) ?? "";
  const phone = parts.find((p) => p !== email && (p.match(/\d/g) ?? []).length >= 7) ?? "";
  const links = parts.filter((p) => p !== email && p !== phone && /\w\.\w+\/|^https?:|linkedin|github/i.test(p));
  const location = parts.find((p) => p !== email && p !== phone && !links.includes(p)) ?? "";
  return { name: "", email, phone, location, links };
}

function splitRole(p: DocxParagraph): { first: string; second: string; third: string; start: string; end: string } {
  const tabbed = p.runs.find((r) => r.startsWith("\t")) ?? "";
  const dates = tabbed.slice(1);
  const [start = "", end = ""] = dates.split(" – ");
  const middle = p.runs.filter((r) => r !== tabbed).slice(1).join("");
  // The template joins title and company with ", ", " · " or " / "; location follows " · ".
  const [second = "", third = ""] = middle.replace(/^\s*[,·/]\s*/, "").split(" · ");
  return { first: p.runs[0] ?? "", second, third, start, end };
}

/** Rebuilds the structured CV from a DOCX this app generated. */
export function structuredFromDocx(paras: DocxParagraph[]): StructuredCv {
  const cv: StructuredCv = {
    contact: { name: "", email: "", phone: "", location: "", links: [] },
    headline: "",
    summary: "",
    experience: [],
    education: [],
    skills: [],
    other: [],
  };
  let i = 0;
  for (; i < paras.length && paras[i].style !== "Heading1"; i++) {
    const p = paras[i];
    if (p.style === "Title") cv.contact.name = p.text;
    else if (p.style === STYLE_IDS.headline) cv.headline = p.text;
    else if (p.style === STYLE_IDS.contact) cv.contact = { ...parseContact(p.text), name: cv.contact.name };
  }

  while (i < paras.length) {
    const headingText = paras[i].text;
    const body: DocxParagraph[] = [];
    for (i++; i < paras.length && paras[i].style !== "Heading1"; i++) body.push(paras[i]);
    const roles = body.filter((p) => p.style === STYLE_IDS.role);
    const hasLists = body.some((p) => p.list);
    if (roles.length && (hasLists || body.indexOf(roles[0]) < body.length - roles.length)) {
      // Experience: role lines followed by their bullets.
      for (const p of body) {
        if (p.style === STYLE_IDS.role) {
          const r = splitRole(p);
          cv.experience.push({ title: r.first, company: r.second, location: r.third, start: r.start, end: r.end, bullets: [] });
        } else if (p.list && cv.experience.length) cv.experience[cv.experience.length - 1].bullets.push(p.text);
      }
    } else if (roles.length) {
      for (const p of roles) {
        const r = splitRole(p);
        cv.education.push({ degree: r.first, institution: r.second, start: r.start, end: r.end });
      }
    } else if (body.some((p) => p.style === STYLE_IDS.skills)) {
      cv.skills = body.flatMap((p) => p.text.split(/,|\s·\s/).map((s) => s.trim()).filter(Boolean));
    } else if (hasLists) {
      cv.other.push({ heading: headingText, items: body.filter((p) => p.list).map((p) => p.text) });
    } else {
      cv.summary = body.map((p) => p.text).join(" ").trim();
    }
  }
  return cv;
}
