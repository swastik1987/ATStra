// Generates the synthetic CV fixtures in tests/fixtures/ from cv-content.json.
// Run: node scripts/make-fixtures.mjs
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../tests/fixtures/", import.meta.url);
const cv = JSON.parse(readFileSync(new URL("cv-content.json", dir), "utf8"));
const A4 = [595.28, 841.89];
const INK = rgb(0.08, 0.09, 0.12);
const ACCENT = rgb(0.12, 0.23, 0.37);

function wrap(text, font, size, width) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

async function setup() {
  const doc = await PDFDocument.create();
  doc.setTitle("Synthetic CV fixture");
  doc.setProducer("cv-tailor fixtures");
  doc.setCreator("cv-tailor fixtures");
  const page = doc.addPage(A4);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, page, regular, bold };
}

/** Writes a column of content top-down. Returns the writer. */
function writer(page, x, width, top) {
  let y = top;
  return {
    get y() {
      return y;
    },
    gap(h) {
      y -= h;
    },
    text(str, font, size, color = INK) {
      for (const l of wrap(str, font, size, width)) {
        page.drawText(l, { x, y, size, font, color });
        y -= size * 1.35;
      }
    },
    heading(str, font) {
      y -= 6;
      page.drawText(str, { x, y, size: 12, font, color: ACCENT });
      y -= 18;
    },
    bullet(str, font, size) {
      const lines = wrap(str, font, size, width - 12);
      lines.forEach((l, i) => {
        if (i === 0) page.drawText("•", { x, y, size, font, color: INK });
        page.drawText(l, { x: x + 12, y, size, font, color: INK });
        y -= size * 1.35;
      });
      y -= 2;
    },
    roleLine(left, right, fonts, size) {
      page.drawText(left, { x, y, size, font: fonts.bold, color: INK });
      const w = fonts.regular.widthOfTextAtSize(right, size);
      page.drawText(right, { x: x + width - w, y, size, font: fonts.regular, color: INK });
      y -= size * 1.4;
    },
  };
}

function experience(w, fonts, size) {
  for (const role of cv.experience) {
    w.roleLine(`${role.title}, ${role.company}`, `${role.start} - ${role.end}`, fonts, size);
    w.text(role.location, fonts.regular, size - 1);
    for (const b of role.bullets) w.bullet(b, fonts.regular, size);
    w.gap(6);
  }
}

async function singleColumn() {
  const { doc, page, regular, bold } = await setup();
  const fonts = { regular, bold };
  const w = writer(page, 57, A4[0] - 114, A4[1] - 70);
  w.text(cv.name, bold, 22);
  w.text(cv.headline, regular, 12);
  w.text(cv.contact.join("  |  "), regular, 9.5);
  w.heading("Summary", bold);
  w.text(cv.summary, regular, 10.5);
  w.heading("Experience", bold);
  experience(w, fonts, 10.5);
  w.heading("Education", bold);
  for (const e of cv.education) w.roleLine(`${e.degree}, ${e.institution}`, `${e.start} - ${e.end}`, fonts, 10.5);
  w.heading("Skills", bold);
  w.text(cv.skills.join(", "), regular, 10.5);
  return doc.save();
}

async function twoColumn() {
  const { doc, page, regular, bold } = await setup();
  const fonts = { regular, bold };
  // Sidebar band, like a designed template.
  page.drawRectangle({ x: 0, y: 0, width: 190, height: A4[1], color: rgb(0.93, 0.95, 0.98) });
  const side = writer(page, 28, 140, A4[1] - 70);
  side.text(cv.name, bold, 18);
  side.text(cv.headline, regular, 10.5);
  side.heading("Contact", bold);
  for (const c of cv.contact) side.text(c, regular, 8.5);
  side.heading("Skills", bold);
  for (const s of cv.skills) side.text(s, regular, 9.5);
  side.heading("Education", bold);
  for (const e of cv.education) {
    side.text(e.degree, bold, 9.5);
    side.text(e.institution, regular, 9);
    side.text(`${e.start} - ${e.end}`, regular, 9);
  }
  const main = writer(page, 215, A4[0] - 215 - 40, A4[1] - 70);
  main.heading("Summary", bold);
  main.text(cv.summary, regular, 10);
  main.heading("Experience", bold);
  experience(main, fonts, 10);
  return doc.save();
}

async function scanned() {
  // An image-only page: shapes that look like a scan, no text layer at all.
  const doc = await PDFDocument.create();
  const page = doc.addPage(A4);
  page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: rgb(0.97, 0.96, 0.94) });
  let y = A4[1] - 80;
  for (let i = 0; i < 38; i++) {
    const width = 200 + ((i * 97) % 280);
    page.drawRectangle({ x: 60, y, width, height: 6, color: rgb(0.35, 0.35, 0.37) });
    y -= i % 6 === 5 ? 30 : 17;
  }
  return doc.save();
}

const out = {
  "cv-single-column.pdf": await singleColumn(),
  "cv-two-column.pdf": await twoColumn(),
  "cv-scanned.pdf": await scanned(),
};
for (const [name, bytes] of Object.entries(out)) {
  writeFileSync(new URL(name, dir), bytes);
  console.log(`wrote ${name} (${bytes.length} bytes)`);
}
