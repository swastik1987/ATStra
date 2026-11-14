import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCv, useDeleteCv } from "@/hooks/useCvs";
import type { Check } from "../../supabase/functions/_shared/parseCv.ts";

const CHECK_ORDER = [
  "text_extractable",
  "single_column",
  "standard_headings",
  "header_footer_clear",
  "no_tables_or_text_boxes",
] as const;

function StatusLabel({ pass }: { pass: boolean }) {
  return (
    <span
      className={
        pass
          ? "inline-flex shrink-0 px-2 py-0.5 rounded-md text-xs font-semibold bg-accent-tint text-accent-ink"
          : "inline-flex shrink-0 px-2 py-0.5 rounded-md text-xs font-semibold bg-warn-tint text-warn-ink"
      }
    >
      {pass ? "Pass" : "Fix"}
    </span>
  );
}

export function CvText() {
  const { id } = useParams();
  const cv = useCv(id);
  const del = useDeleteCv();
  const navigate = useNavigate();

  if (cv.isLoading) return <p className="text-muted">Loading…</p>;
  if (cv.error || !cv.data) return <p role="alert">This CV could not be found.</p>;

  function onDelete() {
    const msg = cv.data!.is_master
      ? "Delete your master CV? The PDF and its extracted text are removed. Applications keep their scores and exported files, but cannot be analysed again. This cannot be undone."
      : "Delete this CV? The PDF and its extracted text are removed. This cannot be undone.";
    if (window.confirm(msg)) del.mutate(cv.data!.id, { onSuccess: () => navigate("/") });
  }

  const { file_name, raw_text, structured, style, parse_checks } = cv.data;
  const checks = parse_checks?.checks as Record<string, Check> | undefined;
  const unmatched = parse_checks?.transcription?.unmatched ?? [];

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Link to="/" className="text-sm">
          Back to applications
        </Link>
        <h1 className="m-0 font-heading font-bold text-[32px] leading-tight break-all">{file_name}</h1>
        <p className="m-0 text-muted">
          The text below is in the order a browser reads it from the PDF. Many application portals read it the same way.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onDelete} disabled={del.isPending} className="text-warn-ink">
            {del.isPending ? "Deleting…" : "Delete this CV"}
          </Button>
          {del.isError && (
            <span role="alert" className="text-sm text-warn-ink">
              {(del.error as Error).message}
            </span>
          )}
        </div>
      </div>

      {checks && (
        <section aria-labelledby="checks-h" className="bg-surface border border-border rounded-[14px] p-6 flex flex-col gap-3">
          <h2 id="checks-h" className="m-0 font-heading font-bold text-xl">
            Parse check
          </h2>
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {CHECK_ORDER.filter((k) => checks[k]).map((k) => (
              <li key={k} className="flex items-start gap-3">
                <StatusLabel pass={checks[k].pass} />
                <span>{checks[k].label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {unmatched.length > 0 && (
        <section role="alert" className="rounded-[14px] bg-warn-tint text-warn-ink p-5">
          <strong>Some extracted lines do not match the PDF text.</strong> They will not be used until you replace the PDF or confirm them later:
          <ul className="mb-0">
            {unmatched.map((u) => (
              <li key={u.path}>{u.text}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="raw-h" className="bg-surface border border-border rounded-[14px] p-6 min-w-0">
          <h2 id="raw-h" className="mt-0 font-heading font-bold text-xl">
            Text as extracted
          </h2>
          <pre className="m-0 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{raw_text}</pre>
        </section>

        <section aria-labelledby="struct-h" className="bg-surface border border-border rounded-[14px] p-6 min-w-0">
          <h2 id="struct-h" className="mt-0 font-heading font-bold text-xl">
            Sections found
          </h2>
          {!structured ? (
            <p className="text-muted">Not read yet.</p>
          ) : (
            <div className="flex flex-col gap-4 text-sm">
              {structured.headline && <p className="m-0 font-semibold">{structured.headline}</p>}
              {structured.summary && (
                <div>
                  <h3 className="m-0 text-base">{style?.heading_labels?.summary ?? "Summary"}</h3>
                  <p className="m-0">{structured.summary}</p>
                </div>
              )}
              {structured.experience.length > 0 && (
                <div>
                  <h3 className="m-0 text-base">{style?.heading_labels?.experience ?? "Experience"}</h3>
                  {structured.experience.map((r, i) => (
                    <div key={i} className="mt-2">
                      <p className="m-0 font-semibold">
                        {r.title}, {r.company}
                        <span className="font-normal text-muted">
                          {" "}
                          · {r.start}
                          {r.end && ` to ${r.end}`}
                        </span>
                      </p>
                      <ul className="m-0 pl-5">
                        {r.bullets.map((b, j) => (
                          <li key={j}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              {structured.education.length > 0 && (
                <div>
                  <h3 className="m-0 text-base">{style?.heading_labels?.education ?? "Education"}</h3>
                  <ul className="m-0 pl-5">
                    {structured.education.map((e, i) => (
                      <li key={i}>
                        {e.degree}, {e.institution} {e.start && `(${e.start}${e.end ? ` to ${e.end}` : ""})`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {structured.skills.length > 0 && (
                <div>
                  <h3 className="m-0 text-base">{style?.heading_labels?.skills ?? "Skills"}</h3>
                  <p className="m-0">{structured.skills.join(", ")}</p>
                </div>
              )}
              {structured.other.map((o, i) => (
                <div key={i}>
                  <h3 className="m-0 text-base">{o.heading}</h3>
                  <ul className="m-0 pl-5">
                    {o.items.map((it, j) => (
                      <li key={j}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
