/**
 * DOCX builder (CLAUDE.md section 9). Renders the structured CV in one of the five templates
 * from src/lib/docx/templates.ts. Always: single column, A4, 2 cm side margins, Word Title and
 * Heading 1 styles, real list bullets, contact in the body, no tables, text boxes or images.
 * Paragraph shading only for a header band (Band) or heading bands (Tint).
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Paragraph,
  ShadingType,
  Tab,
  TabStopType,
  TextRun,
  type IBorderOptions,
  type IRunOptions,
} from "docx";
import type { Style, StructuredCv } from "../../../supabase/functions/_shared/parseCv.ts";
import { DEFAULT_LABELS } from "../../../supabase/functions/_shared/headings.ts";
import { dateRange } from "./dates";
import { DEFAULT_TEMPLATE, TEMPLATES, type CvTemplate, type FontData } from "./templates";

/** A4 and 2 cm margins in twentieths of a point. */
const PAGE = { width: 11906, height: 16838, margin: 1134, top: 1020, bottom: 1020 };
export const TEXT_WIDTH = PAGE.width - 2 * PAGE.margin; // 9638: right tab stop for dates
const BULLETS = "cv-bullets";

/** Paragraph style ids used by the reader to rebuild the structure. */
export const STYLE_IDS = { headline: "CvHeadline", contact: "CvContact", role: "CvRole", skills: "CvSkills" } as const;

const hex = (c: string) => c.replace("#", "").toUpperCase();
const pt = (n: number) => Math.round(n * 2); // half-points
const font = (name: string) => ({ ascii: name, hAnsi: name, cs: name, eastAsia: name });

interface Ctx {
  t: CvTemplate;
  cv: StructuredCv;
}

// ---------- pieces ----------

function run(_t: CvTemplate, text: string, opts: Partial<IRunOptions> = {}): TextRun {
  return new TextRun({ text, ...opts });
}

function bandBorders(t: CvTemplate, first: boolean, last: boolean) {
  const c = hex(t.colours.band!);
  const side = (space: number): IBorderOptions => ({ style: BorderStyle.SINGLE, size: 4, color: c, space });
  return {
    top: first ? side(20) : undefined,
    bottom: last ? side(16) : undefined,
    left: side(28),
    right: side(28),
  };
}

/** Header paragraphs: name, role line, contact. Band shades them as one block. */
function header({ t, cv }: Ctx): Paragraph[] {
  const align = t.nameStyle.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;
  const banded = t.shading === "header" && t.colours.band;
  const parts: { kind: "name" | "headline" | "contact" | "rule"; children: TextRun[] }[] = [];

  const name = cv.contact.name.trim();
  if (name) {
    const nameOpts: Partial<IRunOptions> = {
      font: font(t.fonts.name),
      size: pt(t.sizes.name),
      color: hex(t.colours.name),
      allCaps: t.nameStyle.caps,
      characterSpacing: t.nameStyle.tracking,
    };
    const [first, ...rest] = name.split(/\s+/);
    const children =
      t.nameStyle.split && rest.length
        ? [
            run(t, `${first} `, { ...nameOpts, font: font(t.fonts.nameLight ?? t.fonts.name), color: hex(t.colours.nameLight ?? t.colours.name) }),
            run(t, rest.join(" "), { ...nameOpts, bold: true }),
          ]
        : [run(t, name, { ...nameOpts, bold: t.nameStyle.bold })];
    parts.push({ kind: "name", children });
  }
  if (t.nameRule) parts.push({ kind: "rule", children: [] });
  if (cv.headline.trim()) {
    parts.push({
      kind: "headline",
      children: [
        run(t, cv.headline.trim(), {
          font: font(t.fonts.headline),
          size: pt(t.sizes.headline),
          color: hex(t.colours.headline),
          bold: t.headline.bold,
          allCaps: t.headline.caps,
          characterSpacing: t.headline.tracking,
        }),
      ],
    });
  }
  const c = cv.contact;
  const contact = [c.email, c.phone, c.location, ...c.links].filter((x) => x && x.trim()).join(t.contactSeparator);
  if (contact) {
    parts.push({
      kind: "contact",
      children: [run(t, contact, { font: font(t.fonts.meta), size: pt(t.sizes.contact), color: hex(t.colours.contact) })],
    });
  }

  return parts.map((p, i) => {
    const banding = banded
      ? {
          shading: { type: ShadingType.CLEAR, color: "auto", fill: hex(t.colours.band!) },
          border: bandBorders(t, i === 0, i === parts.length - 1),
          indent: { left: -567, right: -567 },
        }
      : {};
    const spacing =
      p.kind === "name"
        ? { after: t.nameRule ? 60 : 40 }
        : p.kind === "rule"
          ? { after: 140 }
          : p.kind === "headline"
            ? { after: 60 }
            : { after: banded ? 0 : 200 };
    if (p.kind === "rule") {
      const side = Math.round((TEXT_WIDTH - t.nameRule!.width) / 2);
      return new Paragraph({
        alignment: AlignmentType.CENTER,
        indent: { left: side, right: side },
        spacing,
        border: { bottom: { style: BorderStyle.SINGLE, size: t.nameRule!.size, color: hex(t.nameRule!.colour), space: 1 } },
        children: [],
      });
    }
    const style = p.kind === "name" ? undefined : p.kind === "headline" ? STYLE_IDS.headline : STYLE_IDS.contact;
    return new Paragraph({
      ...(p.kind === "name" ? { heading: HeadingLevel.TITLE } : { style }),
      alignment: align,
      spacing,
      keepNext: true,
      ...banding,
      children: p.children,
    });
  });
}

/** Rough rendered width of a label, in twips, for Axis's short centred rule. */
function labelWidth(t: CvTemplate, label: string): number {
  const chars = label.length;
  const em = t.sizes.heading * 20; // twips per em
  return Math.round(chars * em * (t.heading.caps ? 0.72 : 0.58) + chars * t.heading.tracking + 2 * 240);
}

function heading(t: CvTemplate, label: string): Paragraph {
  const h = t.heading;
  const ruleColour = hex(t.colours.rule ?? t.colours.heading);
  const base = {
    heading: HeadingLevel.HEADING_1,
    keepNext: true,
    alignment: h.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
  };
  if (h.rule === "leader") {
    return new Paragraph({
      ...base,
      tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH, leader: "dot" }],
      children: [new TextRun(label), new TextRun({ children: [new Tab()], color: ruleColour, bold: true })],
    });
  }
  if (h.rule === "short") {
    const side = Math.max(0, Math.round((TEXT_WIDTH - labelWidth(t, label)) / 2));
    return new Paragraph({
      ...base,
      indent: { left: side, right: side },
      border: { bottom: { style: BorderStyle.SINGLE, size: h.ruleSize ?? 4, color: ruleColour, space: 4 } },
      children: [new TextRun(label)],
    });
  }
  if (h.rule === "bottom") {
    return new Paragraph({
      ...base,
      border: { bottom: { style: BorderStyle.SINGLE, size: h.ruleSize ?? 4, color: ruleColour, space: 3 } },
      children: [new TextRun(label)],
    });
  }
  if (t.shading === "headings" && t.colours.headingFill) {
    const fill = hex(t.colours.headingFill);
    const side: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: fill, space: 5 };
    return new Paragraph({
      ...base,
      shading: { type: ShadingType.CLEAR, color: "auto", fill },
      border: { top: { ...side, space: 2 }, bottom: { ...side, space: 2 }, left: side, right: side },
      indent: { left: 120, right: 120 },
      children: [new TextRun(label)],
    });
  }
  return new Paragraph({ ...base, children: [new TextRun(label)] });
}

function roleLine(t: CvTemplate, title: string, where: string, dates: string): Paragraph {
  const children: TextRun[] = [run(t, title, { bold: true, font: font(t.fonts.strong), color: hex(t.colours.text) })];
  if (where) children.push(run(t, where, { color: hex(t.colours.muted) }));
  if (dates) {
    children.push(
      new TextRun({
        children: [new Tab(), dates],
        font: font(t.fonts.meta),
        size: pt(t.sizes.date),
        color: hex(t.colours.date),
      }),
    );
  }
  return new Paragraph({
    style: STYLE_IDS.role,
    keepNext: true,
    tabStops: [{ type: TabStopType.RIGHT, position: TEXT_WIDTH }],
    children,
  });
}

const bullet = (text: string) => new Paragraph({ numbering: { reference: BULLETS, level: 0 }, children: [new TextRun(text)] });

function sectionBody(key: string, { t, cv }: Ctx): Paragraph[] {
  const prose = t.centreProse ? AlignmentType.CENTER : AlignmentType.LEFT;
  if (key === "summary") return cv.summary.trim() ? [new Paragraph({ alignment: prose, children: [new TextRun(cv.summary.trim())] })] : [];
  if (key === "experience") {
    return cv.experience.flatMap((r) => {
      // "Title, Company · Location" (join per template) then the dates after a right tab stop.
      const company = r.title && r.company.trim() ? `${t.roleJoin}${r.company.trim()}` : "";
      const location = r.location.trim() ? ` · ${r.location.trim()}` : "";
      return [roleLine(t, r.title || r.company, `${company}${location}`, dateRange(r.start, r.end)), ...r.bullets.filter((b) => b.trim()).map(bullet)];
    });
  }
  if (key === "education") {
    return cv.education.map((e) => roleLine(t, e.degree || e.institution, e.degree && e.institution ? `${t.roleJoin}${e.institution}` : "", dateRange(e.start, e.end)));
  }
  if (key === "skills") {
    return cv.skills.length ? [new Paragraph({ style: STYLE_IDS.skills, alignment: prose, children: [new TextRun(cv.skills.join(t.skillsSeparator))] })] : [];
  }
  if (key.startsWith("other:")) {
    const o = cv.other.find((x) => x.heading === key.slice(6));
    return o ? o.items.filter((i) => i.trim()).map(bullet) : [];
  }
  return [];
}

/** Sections in the original order, then anything with content that the order missed. */
export function sectionKeys(cv: StructuredCv, style: Style): string[] {
  const all = ["summary", "experience", "education", "skills", ...cv.other.map((o) => `other:${o.heading}`)];
  const ordered = style.section_order.filter((k) => all.includes(k));
  const ctx = { t: TEMPLATES[DEFAULT_TEMPLATE], cv };
  return [...ordered, ...all.filter((k) => !ordered.includes(k))].filter((k) => sectionBody(k, ctx).length > 0);
}

export interface BuildOptions {
  template?: CvTemplate;
  /** Font files to embed; without them Word falls back to a system font. */
  fonts?: FontData[];
  /** Heading renames from accepted Format suggestions, by section key. */
  headingLabels?: Record<string, string>;
  title?: string;
}

export function buildCvDocument(cv: StructuredCv, style: Style, opts: BuildOptions = {}): Document {
  const t = opts.template ?? TEMPLATES[DEFAULT_TEMPLATE];
  const ctx: Ctx = { t, cv };
  const label = (key: string) =>
    opts.headingLabels?.[key] ?? style.heading_labels[key] ?? DEFAULT_LABELS[key] ?? (key.startsWith("other:") ? key.slice(6) : key);

  const children: Paragraph[] = [...header(ctx)];
  for (const key of sectionKeys(cv, style)) children.push(heading(t, label(key)), ...sectionBody(key, ctx));

  const body = { font: font(t.fonts.body), size: pt(t.sizes.body), color: hex(t.colours.text) };
  return new Document({
    creator: "ATStra",
    title: opts.title ?? (cv.contact.name ? `${cv.contact.name} CV` : "CV"),
    fonts: opts.fonts?.map((f) => ({
      name: f.family,
      data: f.regular as unknown as Buffer,
      ...(f.bold ? { bold: f.bold as unknown as Buffer } : {}),
    })),
    styles: {
      default: {
        document: { run: body, paragraph: { spacing: { after: 50, line: 264 } } },
        title: { run: { font: font(t.fonts.name), size: pt(t.sizes.name), color: hex(t.colours.name) }, paragraph: { spacing: { after: 40 } } },
        heading1: {
          run: {
            font: font(t.fonts.heading),
            size: pt(t.sizes.heading),
            bold: true,
            color: hex(t.colours.heading),
            allCaps: t.heading.caps,
            characterSpacing: t.heading.tracking,
          },
          paragraph: { spacing: { before: t.heading.spaceBefore * 20, after: 100 }, keepNext: true },
        },
      },
      paragraphStyles: [
        { id: STYLE_IDS.headline, name: "CV Headline", basedOn: "Normal", run: { font: font(t.fonts.headline) }, paragraph: { spacing: { after: 40 } } },
        { id: STYLE_IDS.contact, name: "CV Contact", basedOn: "Normal", run: { font: font(t.fonts.meta) }, paragraph: { spacing: { after: 160 } } },
        { id: STYLE_IDS.role, name: "CV Role", basedOn: "Normal", run: { font: font(t.fonts.body) }, paragraph: { spacing: { before: 140, after: 40 } } },
        { id: STYLE_IDS.skills, name: "CV Skills", basedOn: "Normal", run: { font: font(t.fonts.body) }, paragraph: { spacing: { after: 40 } } },
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
              text: t.bullet.glyph,
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 340, hanging: 240 } }, run: { color: hex(t.colours.bullet) } },
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
            margin: { top: PAGE.top, right: PAGE.margin, bottom: PAGE.bottom, left: PAGE.margin },
          },
        },
        children,
      },
    ],
  });
}
