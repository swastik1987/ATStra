/** Section headings an ATS reliably recognises. Used by the standard-headings parse check. */
const STANDARD = [
  "summary", "professional summary", "career summary", "profile", "professional profile", "personal profile",
  "about", "about me", "objective", "career objective",
  "experience", "work experience", "professional experience", "relevant experience", "employment",
  "employment history", "work history", "career history",
  "education", "education and training", "academic background", "qualifications", "academic qualifications",
  "skills", "technical skills", "key skills", "core skills", "core competencies", "competencies", "skills and tools",
  "certifications", "certificates", "licenses and certifications", "licences and certifications",
  "projects", "key projects", "publications", "awards", "honours", "honors", "achievements", "awards and achievements",
  "languages", "volunteering", "volunteer experience", "interests", "references", "training", "courses",
  "professional development", "memberships", "affiliations", "additional information", "contact", "personal details",
];

const SET = new Set(STANDARD);

export const DEFAULT_LABELS: Record<string, string> = {
  summary: "Summary",
  experience: "Experience",
  education: "Education",
  skills: "Skills",
};

export function isStandardHeading(label: string): boolean {
  const key = label.toLowerCase().replace(/&/g, "and").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  return SET.has(key);
}
