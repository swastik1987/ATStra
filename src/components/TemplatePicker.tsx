import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { TEMPLATES, TEMPLATE_IDS, type CvTemplate, type TemplateId } from "@/lib/docx/templates";
import { dateRange } from "@/lib/docx/dates";
import type { Style, StructuredCv } from "../../supabase/functions/_shared/parseCv.ts";
import { DEFAULT_LABELS } from "../../supabase/functions/_shared/headings.ts";
import { cn } from "@/lib/utils";

const SHEET_W = 794; // A4 at 96 dpi
const VISIBLE_H = 460; // the top of the page: header, first role, skills
const PT = 96 / 72;

/** Registers the template font files once, so previews use the same faces as the DOCX. */
const loaded = new Set<string>();
function useTemplateFonts() {
  const [, setReady] = useState(0);
  useEffect(() => {
    if (typeof FontFace === "undefined") return;
    const jobs: Promise<unknown>[] = [];
    for (const id of TEMPLATE_IDS) {
      for (const f of TEMPLATES[id].fontFiles) {
        const faces: [string, string][] = [[f.regular, "400"], ...(f.bold ? [[f.bold, "700"] as [string, string]] : [])];
        for (const [file, weight] of faces) {
          const key = `${f.family}:${weight}`;
          if (loaded.has(key)) continue;
          loaded.add(key);
          const face = new FontFace(f.family, `url(/fonts/${file})`, { weight });
          jobs.push(face.load().then((ff) => document.fonts.add(ff)).catch(() => loaded.delete(key)));
        }
      }
    }
    if (jobs.length) Promise.all(jobs).then(() => setReady((n) => n + 1));
  }, []);
}

const ff = (name: string) => `"${name}", Arial, sans-serif`;

/** A section heading drawn the way the template draws it in Word. */
function Heading({ t, text }: { t: CvTemplate; text: string }) {
  const c = t.colours;
  const base: CSSProperties = {
    fontFamily: ff(t.fonts.heading),
    fontSize: t.sizes.heading * PT,
    fontWeight: 700,
    color: c.heading,
    textTransform: t.heading.caps ? "uppercase" : "none",
    letterSpacing: `${t.heading.tracking / 20}pt`,
    textAlign: t.heading.align,
    margin: `${t.heading.spaceBefore * PT}px 0 8px`,
  };
  if (t.heading.rule === "leader") {
    return (
      <div style={{ ...base, display: "flex", alignItems: "baseline", gap: 8 }}>
        {text}
        <span style={{ flex: 1, borderBottom: `3px dotted ${c.rule ?? c.heading}` }} />
      </div>
    );
  }
  if (t.heading.rule === "short") {
    return (
      <div style={base}>
        <span style={{ display: "inline-block", padding: "0 14px 6px", borderBottom: `1.5px solid ${c.rule}` }}>{text}</span>
      </div>
    );
  }
  if (t.shading === "headings") {
    return <div style={{ ...base, background: c.headingFill, padding: "5px 10px" }}>{text}</div>;
  }
  const ruled = t.heading.rule === "bottom";
  return <div style={{ ...base, paddingBottom: ruled ? 5 : 0, borderBottom: ruled ? `1px solid ${c.rule}` : "none" }}>{text}</div>;
}

function Preview({ t, cv, style }: { t: CvTemplate; cv: StructuredCv; style: Style }) {
  const c = t.colours;
  const banded = t.shading === "header";
  const label = (key: string) => style.heading_labels[key] ?? DEFAULT_LABELS[key] ?? key;
  const [first, ...rest] = (cv.contact.name || "Your Name").split(/\s+/);
  const role = cv.experience[0];
  const contact = [cv.contact.email, cv.contact.phone, cv.contact.location].filter(Boolean).join(t.contactSeparator);

  return (
    <div
      style={{
        width: SHEET_W,
        height: VISIBLE_H,
        boxSizing: "border-box",
        padding: banded ? "0 76px" : "56px 76px 0",
        background: "#FFFFFF",
        color: c.text,
        fontFamily: ff(t.fonts.body),
        fontSize: t.sizes.body * PT,
        lineHeight: 1.45,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          textAlign: t.nameStyle.align,
          background: banded ? c.band : "transparent",
          margin: banded ? "0 -76px 0" : 0,
          padding: banded ? "48px 76px 30px" : 0,
        }}
      >
        <div
          style={{
            fontFamily: ff(t.fonts.name),
            fontSize: t.sizes.name * PT,
            lineHeight: 1.05,
            color: c.name,
            fontWeight: t.nameStyle.bold ? 700 : 400,
            textTransform: t.nameStyle.caps ? "uppercase" : "none",
            letterSpacing: `${t.nameStyle.tracking / 20}pt`,
          }}
        >
          {t.nameStyle.split && rest.length ? (
            <>
              <span style={{ fontFamily: ff(t.fonts.nameLight ?? t.fonts.name), fontWeight: 400, color: c.nameLight }}>{first} </span>
              <span style={{ fontWeight: 700 }}>{rest.join(" ")}</span>
            </>
          ) : (
            cv.contact.name || "Your Name"
          )}
        </div>
        {t.nameRule && <div style={{ width: t.nameRule.width / 15, margin: "10px auto", borderTop: `3px solid ${t.nameRule.colour}` }} />}
        <div
          style={{
            fontFamily: ff(t.fonts.headline),
            fontSize: t.sizes.headline * PT,
            color: c.headline,
            fontWeight: t.headline.bold ? 700 : 400,
            textTransform: t.headline.caps ? "uppercase" : "none",
            letterSpacing: `${t.headline.tracking / 20}pt`,
            marginTop: 6,
          }}
        >
          {cv.headline || "Your headline"}
        </div>
        <div style={{ fontFamily: ff(t.fonts.meta), fontSize: t.sizes.contact * PT, color: c.contact, marginTop: 8, whiteSpace: "pre" }}>{contact}</div>
      </div>

      {role && (
        <>
          <Heading t={t} text={label("experience")} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <div>
              <strong style={{ fontFamily: ff(t.fonts.strong), color: c.text }}>{role.title}</strong>
              <span style={{ color: c.muted }}>
                {t.roleJoin}
                {role.company}
              </span>
            </div>
            <div style={{ fontFamily: ff(t.fonts.meta), fontSize: t.sizes.date * PT, color: c.date, whiteSpace: "nowrap" }}>{dateRange(role.start, role.end)}</div>
          </div>
          <ul style={{ margin: "4px 0 0", paddingLeft: 22, listStyle: `"${t.bullet.glyph}  "` }}>
            {role.bullets.slice(0, 2).map((b, i) => (
              <li key={i} style={{ marginTop: 2 }}>
                {b}
              </li>
            ))}
          </ul>
        </>
      )}
      {cv.skills.length > 0 && (
        <>
          <Heading t={t} text={label("skills")} />
          <div style={{ textAlign: t.centreProse ? "center" : "left" }}>{cv.skills.join(t.skillsSeparator)}</div>
        </>
      )}
    </div>
  );
}

/** Scales a fixed-width preview to the width of its card. */
function Scaled({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / SHEET_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} aria-hidden="true" className="relative w-full overflow-hidden rounded-md border border-border bg-white" style={{ height: VISIBLE_H * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: SHEET_W }}>{children}</div>
    </div>
  );
}

export function TemplatePicker(props: { cv: StructuredCv; style: Style; value: TemplateId; onChange: (id: TemplateId) => void }) {
  useTemplateFonts();
  return (
    <fieldset className="m-0 p-0 border-0 min-w-0">
      <legend className="font-heading font-bold text-xl mb-1">Choose a template</legend>
      <p className="m-0 mb-4 text-sm text-muted">
        Each one is a single-column Word file with real headings and bullets, so application portals read it cleanly. Previews use your CV.
      </p>
      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
        {TEMPLATE_IDS.map((id) => {
          const t = TEMPLATES[id];
          const selected = props.value === id;
          return (
            <label
              key={id}
              className={cn(
                "flex flex-col gap-2 p-3 rounded-[14px] border bg-surface cursor-pointer min-w-0 has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-accent has-[input:focus-visible]:outline-offset-2",
                selected ? "border-accent ring-2 ring-accent" : "border-border hover:border-border-strong",
              )}
            >
              <input type="radio" name="cv-template" value={id} checked={selected} onChange={() => props.onChange(id)} className="sr-only" />
              <Scaled>
                <Preview t={t} cv={props.cv} style={props.style} />
              </Scaled>
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{t.name}</span>
                {selected && <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-accent-tint text-accent-ink">Selected</span>}
              </span>
              <span className="text-xs text-muted leading-snug">{t.description}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
