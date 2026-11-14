import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { METRIC, canAccept, effectiveText, type Suggestion } from "@/lib/applyEdits";
import type { StructuredCv } from "../../../supabase/functions/_shared/parseCv.ts";
import { cn } from "@/lib/utils";
import { Pill, formatPoints } from "./Bits";

export type Patch = Partial<Pick<Suggestion, "status" | "user_text" | "edited_text" | "source" | "confirmed" | "section_ref">>;

const TYPE_LABEL: Record<Suggestion["type"], string> = {
  rewrite: "Rewrite",
  keyword: "Keyword",
  quantify: "Quantify",
  unverified_keyword: "Unverified keyword",
  format: "Format",
  hygiene: "Hygiene",
};

function titleFor(s: Suggestion): string {
  switch (s.type) {
    case "keyword":
      return `Use the posting's wording: "${s.term}"`;
    case "rewrite":
      return "Make this line show what your CV already says";
    case "quantify":
      return "Add a number to this bullet";
    case "unverified_keyword":
      return `The posting asks for "${s.term}". Have you used it?`;
    case "format":
      return s.section_ref.startsWith("/_style/") ? `Rename the "${s.before_text}" heading` : s.after_text;
    case "hygiene":
      return s.section_ref === "/_format/dates" ? "Use one date format" : "Fix a spelling mistake";
  }
}

export function sectionLabel(ref: string, cv: StructuredCv): string {
  const role = ref.match(/^\/experience\/(\d+)\/bullets(?:\/(\d+))?$/);
  if (role) {
    const r = cv.experience[Number(role[1])];
    const where = r ? `${r.title}, ${r.company}` : "Experience";
    return role[2] !== undefined ? `Experience · ${where} · bullet ${Number(role[2]) + 1}` : `Experience · ${where} · new bullet`;
  }
  if (ref === "/summary") return "Summary";
  if (ref === "/headline") return "Headline";
  if (ref.startsWith("/skills")) return "Skills";
  if (ref.startsWith("/other/")) return cv.other[Number(ref.split("/")[2])]?.heading ?? "Other";
  if (ref === "/_format/dates") return "Dates";
  if (ref.startsWith("/_style/")) return "Section heading";
  if (ref.startsWith("/_format/")) return "Layout";
  return "CV";
}

function ProposedText({ text }: { text: string }) {
  const parts = text.split(METRIC);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <mark className="bg-warn-tint text-warn-ink px-1 rounded">your metric</mark>}
        </span>
      ))}
    </>
  );
}

export interface CardProps {
  s: Suggestion;
  cv: StructuredCv;
  points: number;
  conflictWith: number | null;
  onChange: (patch: Patch, persistNow: boolean) => void;
}

export function SuggestionCard({ s, cv, points, conflictWith, onChange }: CardProps) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.edited_text ?? s.after_text);
  const accepted = s.status === "accepted";
  const skipped = s.status === "skipped";
  const acceptable = canAccept(s);
  const editable = s.type === "rewrite" || s.type === "keyword" || s.type === "quantify" || (s.type === "hygiene" && !s.section_ref.startsWith("/_"));
  const title = titleFor(s);
  const statusText = conflictWith !== null ? "Conflict" : accepted ? "Accepted" : skipped ? "Skipped" : "Open";
  const roleOptions = cv.experience.map((r, i) => ({ ref: `/experience/${i}/bullets`, label: `New bullet in ${r.title}, ${r.company}` }));
  const whereOptions = [...roleOptions, { ref: "/summary", label: "Add to the summary" }, { ref: "/skills", label: "Add to skills" }];

  const userFields = (): Patch =>
    s.type === "quantify" || s.type === "unverified_keyword" ? { user_text: s.user_text, source: "user" } : {};

  return (
    <article
      aria-label={`${TYPE_LABEL[s.type]}: ${title}`}
      className={cn(
        "bg-surface border rounded-[14px] p-5 flex flex-col gap-3",
        accepted ? "border-accent" : "border-border",
        skipped && "opacity-80",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Pill tone={s.type === "unverified_keyword" ? "warn" : "plain"}>{TYPE_LABEL[s.type]}</Pill>
          <span className="text-muted">{sectionLabel(s.section_ref, cv)}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Pill tone={conflictWith !== null ? "warn" : accepted ? "ok" : "plain"}>{statusText}</Pill>
          <span className="font-semibold text-accent-ink tabular-nums">+{formatPoints(points)}</span>
        </div>
      </div>

      <h3 className="m-0 text-base font-semibold">{title}</h3>

      {s.type !== "unverified_keyword" && s.type !== "format" && s.before_text && (
        <div className="grid gap-1">
          <div className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Now</div>
          <div className="text-sm">{s.before_text}</div>
        </div>
      )}

      {s.type === "format" || (s.type === "hygiene" && s.section_ref === "/_format/dates") ? (
        <p className="m-0 text-sm">
          {s.before_text}. <span className="text-muted">Applied by the DOCX template: {s.after_text}.</span>
        </p>
      ) : s.type !== "unverified_keyword" ? (
        <div className="grid gap-1">
          <div className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Proposed{s.edited_text ? " (your wording)" : ""}</div>
          {editing ? (
            <div className="flex flex-col gap-2">
              <label htmlFor={`${id}-edit`} className="sr-only">
                Edit wording
              </label>
              <textarea
                id={`${id}-edit`}
                value={draft}
                rows={3}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full px-3 py-2 rounded-[10px] border border-border-strong font-[inherit] text-sm"
              />
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    const text = draft.trim();
                    onChange({ edited_text: text && text !== s.after_text ? text : null, source: "user" }, true);
                    setEditing(false);
                  }}
                >
                  Save wording
                </Button>
                <Button
                  onClick={() => {
                    setDraft(s.edited_text ?? s.after_text);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm font-medium">
              <ProposedText text={s.type === "quantify" && !s.user_text ? (s.edited_text ?? s.after_text) : effectiveText(s)} />
            </div>
          )}
        </div>
      ) : null}

      {s.evidence_quote && s.type !== "unverified_keyword" && (
        <div className="text-sm text-muted">
          From your CV: <q>{s.evidence_quote}</q>
        </div>
      )}

      {s.type === "quantify" && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-metric`} className="text-sm font-semibold">
            Your metric (inserted exactly as you type it)
          </label>
          <input
            id={`${id}-metric`}
            type="text"
            placeholder="For example 18% or £40k"
            value={s.user_text ?? ""}
            disabled={accepted}
            onChange={(e) => onChange({ user_text: e.target.value }, false)}
            onBlur={() => onChange({ user_text: s.user_text, source: "user" }, true)}
            className="min-h-11 px-3 rounded-[10px] border border-border-strong font-[inherit]"
          />
          {!acceptable && <div className="text-sm text-muted">Type the real figure, including a number, to accept this.</div>}
        </div>
      )}

      {s.type === "unverified_keyword" && (
        <div className="flex flex-col gap-3 rounded-[10px] bg-warn-tint text-warn-ink p-4">
          <p className="m-0 text-sm">
            <strong>Not in your CV.</strong> Only add this if you have really used {s.term}. Your words are inserted exactly as you type them.
          </p>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={s.confirmed}
              disabled={accepted}
              onChange={(e) => onChange({ confirmed: e.target.checked }, true)}
              className="w-4 h-4"
            />
            I have used {s.term}
          </label>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-where`} className="text-sm font-semibold">
              Where
            </label>
            <select
              id={`${id}-where`}
              value={s.section_ref}
              disabled={accepted}
              onChange={(e) => onChange({ section_ref: e.target.value }, true)}
              className="min-h-11 px-3 rounded-[10px] border border-border-strong bg-surface text-ink font-[inherit]"
            >
              {whereOptions.map((o) => (
                <option key={o.ref} value={o.ref}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-own`} className="text-sm font-semibold">
              Your wording (must mention {s.term})
            </label>
            <textarea
              id={`${id}-own`}
              rows={2}
              value={s.user_text ?? ""}
              disabled={accepted}
              onChange={(e) => onChange({ user_text: e.target.value }, false)}
              onBlur={() => onChange({ user_text: s.user_text, source: "user" }, true)}
              className="px-3 py-2 rounded-[10px] border border-border-strong bg-surface text-ink font-[inherit] text-sm"
            />
          </div>
        </div>
      )}

      {conflictWith !== null && (
        <p role="note" className="m-0 text-sm rounded-[10px] bg-warn-tint text-warn-ink px-3 py-2">
          Suggestion {conflictWith} also changes this text and ranks higher, so only that one will be applied. Undo one of them.
        </p>
      )}

      {accepted && points === 0 && s.term && (
        <p className="m-0 text-sm text-muted">Your wording does not include "{s.term}", so this edit adds no points.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={accepted ? "secondary" : "primary"}
          aria-pressed={accepted}
          disabled={!accepted && !acceptable}
          onClick={() => onChange(accepted ? { status: "open" } : { status: "accepted", ...userFields() }, true)}
        >
          {accepted ? "Undo accept" : "Accept"}
        </Button>
        <Button aria-pressed={skipped} onClick={() => onChange({ status: skipped ? "open" : "skipped" }, true)}>
          {skipped ? "Undo skip" : "Skip"}
        </Button>
        {editable && !accepted && !editing && <Button onClick={() => setEditing(true)}>Edit wording</Button>}
        {editable && s.edited_text && !accepted && !editing && (
          <Button onClick={() => onChange({ edited_text: null }, true)}>Undo edit</Button>
        )}
      </div>
    </article>
  );
}
