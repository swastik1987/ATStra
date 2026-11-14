import { useEffect, useRef, useState } from "react";
import { Preview, Scaled, useTemplateFonts } from "@/components/TemplatePicker";
import { TEMPLATES, TEMPLATE_IDS } from "@/lib/docx/templates";
import type { Style, StructuredCv } from "../../../supabase/functions/_shared/parseCv.ts";

/** A synthetic sample CV for the previews. Not a real person. */
const SAMPLE_CV: StructuredCv = {
  contact: { name: "Alex Morgan", email: "alex@example.com", phone: "+44 20 7946 0000", location: "London", links: [] },
  headline: "Senior Data Analyst",
  summary: "Data analyst with seven years in logistics and retail.",
  experience: [
    {
      company: "Northwind Freight",
      title: "Senior Data Analyst",
      location: "London",
      start: "2021-03",
      end: "Present",
      bullets: [
        "Built a Looker dashboard suite used by 140 operations staff each week",
        "Cut weekly reporting time from two days to three hours by automating SQL pipelines",
      ],
    },
  ],
  education: [],
  skills: ["SQL", "Python", "Looker", "dbt", "A/B testing", "Stakeholder management"],
  other: [],
};

const SAMPLE_STYLE: Style = {
  section_order: ["experience", "skills"],
  heading_labels: { experience: "Experience", skills: "Skills" },
  font_class: "sans",
  accent_color: null,
  name_align: "left",
  bullet_style: "disc",
  source_columns: 1,
};

function Cards() {
  useTemplateFonts();
  return (
    <ul className="m-0 p-0 list-none grid gap-4 grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {TEMPLATE_IDS.map((id) => {
        const t = TEMPLATES[id];
        return (
          <li key={id} className="flex flex-col gap-2.5 p-3 rounded-[14px] bg-white border border-border shadow-[0_10px_30px_-18px_rgba(20,40,110,0.4)]">
            <Scaled>
              <Preview t={t} cv={SAMPLE_CV} style={SAMPLE_STYLE} />
            </Scaled>
            <span className="font-heading font-bold text-lg leading-none mt-1">{t.name}</span>
            <span className="text-sm text-muted leading-snug">{t.description}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** The five export templates, previewed with a sample CV. Fonts load only once the section is near. */
export function TemplateShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  // Without IntersectionObserver (old browsers), show the cards straight away.
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className="min-h-[300px]">{near && <Cards />}</div>;
}
