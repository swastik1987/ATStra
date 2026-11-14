/**
 * DOCX template (CLAUDE.md section 9). Single column, A4, 2 cm margins, 10.5 pt body,
 * Word's built-in Title and Heading 1 styles, real list items, contact details in the body.
 * No tables, text boxes, columns, images, headers, footers or backgrounds.
 */
import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
  type IParagraphOptions,
} from "docx";
import type { Style, StructuredCv } from "../../../supabase/functions/_shared/parseCv.ts";
import { DEFAULT_LABELS } from "../../../supabase/functions/_shared/headings.ts";
import { dateRange } from "./dates";

/** A4 and 2 cm margins in twentieths of a point. */
const PAGE = { width: 11906, height: 16838, margin: 1134 };
const TEXT_WIDTH = PAGE.width - 2 * PAGE.margin; // 9638: right tab stop for dates
const BODY_HALF_POINTS = 21; // 10.5 pt
const BULLETS = "cv-bullets";

/** Paragraph style ids used by the reader to rebuild the structure. */
export const STYLE_IDS = { headline: "CvHeadline", contact: "CvContact", role: "CvRole", skills: "CvSkills" } as const;

const BULLET_CHAR: Record<string, string> = {
  disc: "•",
  circle: "◦",
  square: "▪",
  dash: "–",
  arrow: "›",
  none: "•",
  other: "•",
};

// ---------- colour ----------

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of a colour against white. */
export function contrastRatio(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/** Heading colour: the CV's accent if it has at least 4.5:1 contrast on white, else black. */
export function headingColour(accent: string | null | undefined): string {
  return accent && /^#[0-9a-f]{6}$/i.test(accent) && contrastRatio(accent) >= 4.5 ? accent.slice(1).toUpperCase() : "000000";
}

// ---------- content ----------

const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT } as const;

function roleLine(left: string, middle: string, right: string): Paragraph {
  const children: (TextRun)[] = [new TextRun({ text: left, bold: true })];
  if (middle) children.push(new TextRun({ text: middle }));
  if (right) children.push(new TextRun({ children: [new Tab(), right] }));
  return new Paragraph({
    style: STYLE_IDS.role,
    keepNext: true,
    tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }],
    children,
  });
}

const bullet = (text: string) => new Paragraph({ numbering: { reference: BULLETS, level: 0 }, children: [new TextRun(text)] });
const heading = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, children: [new TextRun(text)] });

function sectionBody(key: string, cv: StructuredCv): Paragraph[] {
  if (key === "summary") return cv.summary.trim() ? [new Paragraph({ children: [new TextRun(cv.summary.trim())] })] : [];
  if (key === "experience") {
    return cv.experience.flatMap((r) => {
      // "Title, Company · Location" then the dates after a right tab stop.
      const company = r.title && r.company.trim() ? `, ${r.company.trim()}` : "";
      const location = r.location.trim() ? ` · ${r.location.trim()}` : "";
      return [roleLine(r.title || r.company, `${company}${location}`, dateRange(r.start, r.end)), ...r.bullets.filter((b) => b.trim()).map(bullet)];
    });
  }
  if (key === "education") {
    return cv.education.map((e) => roleLine(e.degree || e.institution, e.degree && e.institution ? `, ${e.institution}` : "", dateRange(e.start, e.end)));
  }
  if (key === "skills") return cv.skills.length ? [new Paragraph({ style: STYLE_IDS.skills, children: [new TextRun(cv.skills.join(", "))] })] : [];
  if (key.startsWith("other:")) {
    const o = cv.other.find((x) => x.heading === key.slice(6));
    return o ? o.items.filter((i) => i.trim()).map(bullet) : [];
  }
  return [];
}

function hasContent(key: string, cv: StructuredCv): boolean {
  return sectionBody(key, cv).length > 0;
}

/** Sections in the original order, then anything with content that the order missed. */
export function sectionKeys(cv: StructuredCv, style: Style): string[] {
  const all = ["summary", "experience", "education", "skills", ...cv.other.map((o) => `other:${o.heading}`)];
  const ordered = style.section_order.filter((k) => all.includes(k));
  return [...ordered, ...all.filter((k) => !ordered.includes(k))].filter((k) => hasContent(k, cv));
}

export interface BuildOptions {
  /** Heading renames from accepted Format suggestions, by section key. */
  headingLabels?: Record<string, string>;
  title?: string;
}

export function buildCvDocument(cv: StructuredCv, style: Style, opts: BuildOptions = {}): Document {
  const font = style.font_class === "serif" ? "Cambria" : "Calibri";
  const colour = headingColour(style.accent_color);
  const align = ALIGN[style.name_align] ?? AlignmentType.LEFT;
  const label = (key: string) =>
    opts.headingLabels?.[key] ?? style.heading_labels[key] ?? DEFAULT_LABELS[key] ?? (key.startsWith("other:") ? key.slice(6) : key);

  const c = cv.contact;
  const contactLine = [c.email, c.phone, c.location, ...c.links].filter((x) => x && x.trim()).join("  |  ");
  const children: Paragraph[] = [];
  if (c.name.trim()) children.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: align, children: [new TextRun(c.name.trim())] }));
  if (cv.headline.trim()) children.push(new Paragraph({ style: STYLE_IDS.headline, alignment: align, children: [new TextRun(cv.headline.trim())] }));
  if (contactLine) children.push(new Paragraph({ style: STYLE_IDS.contact, alignment: align, children: [new TextRun(contactLine)] }));
  for (const key of sectionKeys(cv, style)) children.push(heading(label(key)), ...sectionBody(key, cv));

  const para = (extra: Partial<IParagraphOptions["spacing"]> = {}) => ({ spacing: { after: 60, ...extra } });
  return new Document({
    creator: "CV Tailor",
    title: opts.title ?? (c.name ? `${c.name} CV` : "CV"),
    styles: {
      default: {
        document: { run: { font, size: BODY_HALF_POINTS, color: "000000" }, paragraph: para() },
        title: { run: { font, size: 36, bold: true, color: "000000" }, paragraph: { spacing: { after: 40 } } },
        heading1: {
          run: { font, size: 26, bold: true, color: colour },
          paragraph: { spacing: { before: 200, after: 80 }, keepNext: true },
        },
      },
      paragraphStyles: [
        { id: STYLE_IDS.headline, name: "CV Headline", basedOn: "Normal", run: { font, size: 24 }, paragraph: para({ after: 20 }) },
        { id: STYLE_IDS.contact, name: "CV Contact", basedOn: "Normal", run: { font, size: 19 }, paragraph: para({ after: 120 }) },
        { id: STYLE_IDS.role, name: "CV Role", basedOn: "Normal", run: { font }, paragraph: para({ before: 120, after: 40 }) },
        { id: STYLE_IDS.skills, name: "CV Skills", basedOn: "Normal", run: { font }, paragraph: para() },
      ],
    },
    numbering: {
      config: [
        {
          reference: BULLETS,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: BULLET_CHAR[style.bullet_style] ?? "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE.width, height: PAGE.height },
            margin: { top: PAGE.margin, right: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin },
          },
        },
        children,
      },
    ],
  });
}
