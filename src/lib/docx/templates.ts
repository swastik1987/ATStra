/**
 * The five export templates (CLAUDE.md section 9). One config per template; the builder
 * renders any of them. Fonts are static Google Fonts TTFs in public/fonts (SIL OFL),
 * embedded in the DOCX. Sizes are in points, letter spacing in twentieths of a point.
 */

export type TemplateId = "slate" | "terminal" | "axis" | "band" | "tint";
export const TEMPLATE_IDS: TemplateId[] = ["slate", "terminal", "axis", "band", "tint"];
export const DEFAULT_TEMPLATE: TemplateId = "slate";

/** One embedded font family: Word embeds a regular and an optional bold face per family. */
export interface FontFile {
  family: string;
  regular: string;
  bold?: string;
}

export interface CvTemplate {
  id: TemplateId;
  name: string;
  description: string;
  fontFiles: FontFile[];
  fonts: {
    body: string;
    heading: string;
    name: string;
    /** Given name in a lighter family (split names). */
    nameLight?: string;
    headline: string;
    /** Dates and contact line. */
    meta: string;
    /** Role and degree titles. */
    strong: string;
  };
  sizes: { body: number; name: number; headline: number; contact: number; heading: number; date: number };
  colours: {
    text: string;
    muted: string;
    name: string;
    nameLight?: string;
    headline: string;
    contact: string;
    heading: string;
    date: string;
    bullet: string;
    rule?: string;
    /** Header band fill (shading "header"). */
    band?: string;
    /** Heading band fill (shading "headings"). */
    headingFill?: string;
  };
  nameStyle: { align: "left" | "center"; split: boolean; caps: boolean; tracking: number; bold: boolean };
  headline: { bold: boolean; caps: boolean; tracking: number };
  heading: {
    caps: boolean;
    tracking: number;
    align: "left" | "center";
    /** bottom: full-width rule; short: centred rule under the label; leader: dotted tab leader to the margin. */
    rule: "none" | "bottom" | "short" | "leader";
    ruleSize?: number;
    spaceBefore: number;
  };
  /** A short centred rule between the name and the role line. */
  nameRule?: { colour: string; size: number; width: number };
  shading: "none" | "header" | "headings";
  bullet: { glyph: string };
  contactSeparator: string;
  roleJoin: string;
  skillsSeparator: string;
  /** Centre the summary and skills paragraphs. */
  centreProse: boolean;
}

export const TEMPLATES: Record<TemplateId, CvTemplate> = {
  slate: {
    id: "slate",
    name: "Slate",
    description: "Light first name, bold surname, tracked capital headings in blue over a hairline rule.",
    fontFiles: [
      { family: "Inter", regular: "Inter-400.ttf", bold: "Inter-700.ttf" },
      { family: "Inter Light", regular: "Inter-300.ttf" },
    ],
    fonts: { body: "Inter", heading: "Inter", name: "Inter", nameLight: "Inter Light", headline: "Inter", meta: "Inter", strong: "Inter" },
    sizes: { body: 10, name: 30, headline: 12, contact: 9, heading: 8.5, date: 9 },
    colours: {
      text: "#1C2230", muted: "#5A6478", name: "#0B0F19", nameLight: "#0B0F19", headline: "#2B59FF", contact: "#5A6478",
      heading: "#2B59FF", date: "#5A6478", bullet: "#2B59FF", rule: "#D5DBE6",
    },
    nameStyle: { align: "left", split: true, caps: false, tracking: -14, bold: true },
    headline: { bold: true, caps: false, tracking: 0 },
    heading: { caps: true, tracking: 30, align: "left", rule: "bottom", ruleSize: 4, spaceBefore: 16 },
    shading: "none",
    bullet: { glyph: "•" },
    contactSeparator: "   ·   ",
    roleJoin: " · ",
    skillsSeparator: " · ",
    centreProse: false,
  },
  terminal: {
    id: "terminal",
    name: "Terminal",
    description: "Space Grotesk headings trailed by a dotted rule, monospace dates and contact, emerald accent.",
    fontFiles: [
      { family: "Space Grotesk", regular: "SpaceGrotesk-400.ttf", bold: "SpaceGrotesk-700.ttf" },
      { family: "IBM Plex Sans", regular: "IBMPlexSans-400.ttf", bold: "IBMPlexSans-700.ttf" },
      { family: "IBM Plex Mono", regular: "IBMPlexMono-400.ttf" },
    ],
    fonts: { body: "IBM Plex Sans", heading: "Space Grotesk", name: "Space Grotesk", headline: "Space Grotesk", meta: "IBM Plex Mono", strong: "IBM Plex Sans" },
    sizes: { body: 10, name: 30, headline: 13, contact: 8.5, heading: 12, date: 8.5 },
    colours: {
      text: "#1A1F1C", muted: "#4D5751", name: "#0C110E", headline: "#047857", contact: "#4D5751",
      heading: "#0C110E", date: "#047857", bullet: "#047857", rule: "#047857",
    },
    nameStyle: { align: "left", split: false, caps: false, tracking: -12, bold: true },
    headline: { bold: false, caps: false, tracking: 0 },
    heading: { caps: false, tracking: 0, align: "left", rule: "leader", spaceBefore: 16 },
    shading: "none",
    bullet: { glyph: "›" },
    contactSeparator: "   |   ",
    roleJoin: " / ",
    skillsSeparator: " · ",
    centreProse: false,
  },
  axis: {
    id: "axis",
    name: "Axis",
    description: "Centred and minimal: widely tracked capital name and headings, short rules, indigo dates.",
    fontFiles: [
      { family: "Sora", regular: "Sora-400.ttf", bold: "Sora-700.ttf" },
      { family: "Sora Light", regular: "Sora-300.ttf" },
      { family: "Sora SemiBold", regular: "Sora-600.ttf" },
    ],
    fonts: { body: "Sora", heading: "Sora", name: "Sora Light", headline: "Sora SemiBold", meta: "Sora", strong: "Sora SemiBold" },
    sizes: { body: 9.5, name: 23, headline: 10, contact: 8.5, heading: 8.5, date: 8.5 },
    colours: {
      text: "#20232B", muted: "#5B6070", name: "#12141A", headline: "#3F51B5", contact: "#5B6070",
      heading: "#12141A", date: "#3F51B5", bullet: "#3F51B5", rule: "#C9CEDA",
    },
    nameStyle: { align: "center", split: false, caps: true, tracking: 150, bold: false },
    headline: { bold: false, caps: true, tracking: 24 },
    heading: { caps: true, tracking: 44, align: "center", rule: "short", ruleSize: 4, spaceBefore: 16 },
    nameRule: { colour: "#3F51B5", size: 18, width: 900 },
    shading: "none",
    bullet: { glyph: "•" },
    contactSeparator: "   ·   ",
    roleJoin: ", ",
    skillsSeparator: " · ",
    centreProse: true,
  },
  band: {
    id: "band",
    name: "Band",
    description: "Name, role and contact on a deep indigo band; indigo capital headings below.",
    fontFiles: [
      { family: "DM Sans", regular: "DMSans-400.ttf", bold: "DMSans-700.ttf" },
      { family: "DM Sans Medium", regular: "DMSans-500.ttf" },
      { family: "DM Sans ExtraBold", regular: "DMSans-800.ttf" },
    ],
    fonts: { body: "DM Sans", heading: "DM Sans ExtraBold", name: "DM Sans ExtraBold", headline: "DM Sans Medium", meta: "DM Sans", strong: "DM Sans" },
    sizes: { body: 10, name: 31, headline: 13, contact: 9, heading: 9, date: 9 },
    colours: {
      text: "#1F2033", muted: "#5C5E78", name: "#FFFFFF", headline: "#C7D2FE", contact: "#E0E7FF",
      heading: "#3730A3", date: "#5C5E78", bullet: "#4F46E5", band: "#1E1B4B",
    },
    nameStyle: { align: "left", split: false, caps: false, tracking: -14, bold: false },
    headline: { bold: false, caps: false, tracking: 0 },
    heading: { caps: true, tracking: 26, align: "left", rule: "none", spaceBefore: 16 },
    shading: "header",
    bullet: { glyph: "•" },
    contactSeparator: "   ·   ",
    roleJoin: ", ",
    skillsSeparator: " · ",
    centreProse: false,
  },
  tint: {
    id: "tint",
    name: "Tint",
    description: "Section headings on soft rose bands, heavy name, rose dates.",
    fontFiles: [
      { family: "Plus Jakarta Sans", regular: "PlusJakartaSans-400.ttf", bold: "PlusJakartaSans-700.ttf" },
      { family: "Plus Jakarta Sans ExtraBold", regular: "PlusJakartaSans-800.ttf" },
    ],
    fonts: {
      body: "Plus Jakarta Sans",
      heading: "Plus Jakarta Sans ExtraBold",
      name: "Plus Jakarta Sans ExtraBold",
      headline: "Plus Jakarta Sans",
      meta: "Plus Jakarta Sans",
      strong: "Plus Jakarta Sans",
    },
    sizes: { body: 10, name: 30, headline: 12, contact: 9, heading: 9.5, date: 9 },
    colours: {
      text: "#221C20", muted: "#5F5560", name: "#16111A", headline: "#9F1239", contact: "#5F5560",
      heading: "#9F1239", date: "#9F1239", bullet: "#BE185D", headingFill: "#FFE4EC",
    },
    nameStyle: { align: "left", split: false, caps: false, tracking: -14, bold: false },
    headline: { bold: true, caps: false, tracking: 0 },
    heading: { caps: true, tracking: 10, align: "left", rule: "none", spaceBefore: 14 },
    shading: "headings",
    bullet: { glyph: "•" },
    contactSeparator: "   ·   ",
    roleJoin: ", ",
    skillsSeparator: " · ",
    centreProse: false,
  },
};

export function getTemplate(id: TemplateId | string | null | undefined): CvTemplate {
  return TEMPLATES[(id as TemplateId) in TEMPLATES ? (id as TemplateId) : DEFAULT_TEMPLATE];
}

// ---------- contrast ----------

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #RRGGBB colours. */
export function contrastRatio(fg: string, bg = "#FFFFFF"): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** Every text colour paired with the surface it sits on, for the 4.5:1 check. */
export function textColourPairs(t: CvTemplate): [string, string, string][] {
  const white = "#FFFFFF";
  const headerBg = t.shading === "header" && t.colours.band ? t.colours.band : white;
  const pairs: [string, string, string][] = [
    [t.colours.text, white, "body text"],
    [t.colours.muted, white, "muted text"],
    [t.colours.date, white, "dates"],
    [t.colours.name, headerBg, "name"],
    [t.colours.headline, headerBg, "role line"],
    [t.colours.contact, headerBg, "contact"],
    [t.colours.heading, t.shading === "headings" && t.colours.headingFill ? t.colours.headingFill : white, "headings"],
  ];
  if (t.colours.nameLight) pairs.push([t.colours.nameLight, headerBg, "given name"]);
  return pairs;
}

// ---------- fonts ----------

export interface FontData {
  family: string;
  regular: Uint8Array;
  bold?: Uint8Array;
}

/** Loads a template's font files. The browser passes a fetch of /fonts/<file>; tests read from disk. */
export async function loadTemplateFonts(t: CvTemplate, load: (file: string) => Promise<Uint8Array>): Promise<FontData[]> {
  return Promise.all(
    t.fontFiles.map(async (f) => ({ family: f.family, regular: await load(f.regular), bold: f.bold ? await load(f.bold) : undefined })),
  );
}
