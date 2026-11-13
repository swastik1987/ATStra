import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ALLOWED_VITE_VARS = new Set(["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const browserFiles = [...walk("src"), "index.html", ".env.example", "vite.config.ts"];

describe("no secret reaches the browser", () => {
  it("only public VITE_ variables are referenced", () => {
    for (const file of browserFiles) {
      const names = readFileSync(file, "utf8").match(/VITE_[A-Z0-9_]+/g) ?? [];
      for (const n of names) expect(ALLOWED_VITE_VARS.has(n), `${file} uses ${n}`).toBe(true);
    }
  });

  it("browser code never mentions the model key, model SDK or service role", () => {
    for (const file of walk("src")) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/ANTHROPIC|@anthropic-ai|service_role|SERVICE_ROLE/);
    }
  });

  it("only _shared/model.ts names a model", () => {
    const files = [...walk("src"), ...walk("supabase/functions")].filter((f) => /\.(ts|tsx)$/.test(f));
    const naming = files.filter((f) => /claude-(sonnet|haiku|opus)-/.test(readFileSync(f, "utf8")));
    expect(naming.map((f) => f.replace(/\\/g, "/"))).toEqual(["supabase/functions/_shared/model.ts"]);
  });
});
