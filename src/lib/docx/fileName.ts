/** F15: <Name>_<Role>_<Company>.docx, with words joined by hyphens and unsafe characters removed. */
export function exportFileName(name: string, role: string, company: string): string {
  const part = (s: string) =>
    s
      .normalize("NFC")
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .split(/[\s-]+/)
      .filter(Boolean)
      .join("-");
  const parts = [name, role, company].map(part).filter(Boolean);
  return `${parts.length ? parts.join("_") : "CV"}.docx`;
}
