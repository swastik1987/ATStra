/** Minimal JSON pointer helpers for section_ref (RFC 6901 subset: no escaping needed here). */

export function parseRef(ref: string): string[] | null {
  if (!ref.startsWith("/")) return null;
  return ref.slice(1).split("/");
}

export function getAt(root: unknown, ref: string): unknown {
  const parts = parseRef(ref);
  if (!parts) return undefined;
  let cur: unknown = root;
  for (const p of parts) {
    if (Array.isArray(cur)) {
      if (!/^\d+$/.test(p)) return undefined;
      cur = cur[Number(p)];
    } else if (cur && typeof cur === "object") {
      if (!Object.prototype.hasOwnProperty.call(cur, p)) return undefined;
      cur = (cur as Record<string, unknown>)[p];
    } else return undefined;
  }
  return cur;
}

/** Sets a string at ref. Returns false if the parent does not exist. */
export function setAt(root: unknown, ref: string, value: string): boolean {
  const parts = parseRef(ref);
  if (!parts?.length) return false;
  const parent = getAt(root, `/${parts.slice(0, -1).join("/")}`.replace(/^\/$/, "")) ?? (parts.length === 1 ? root : undefined);
  const key = parts[parts.length - 1];
  if (Array.isArray(parent) && /^\d+$/.test(key) && Number(key) < parent.length) {
    parent[Number(key)] = value;
    return true;
  }
  if (parent && typeof parent === "object" && !Array.isArray(parent) && key in parent) {
    (parent as Record<string, unknown>)[key] = value;
    return true;
  }
  return false;
}

/** True for refs that point at template-level fixes rather than CV text. */
export const isTemplateRef = (ref: string) => ref.startsWith("/_");
