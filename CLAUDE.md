# ATStra

Web app for Gmail users (self sign-up). A user uploads a CV (PDF) and a job description (pasted text or link). The app scores the CV against that job, proposes evidence-backed edits one at a time, and exports the accepted edits as an editable single-column DOCX.

This file is the complete specification. Decisions marked FIXED are not yours to change. Where something is ambiguous, ask before deciding.

---

## 0. How to work

1. Read this whole file before writing code. The UI reference is in `docs/design/` (four `.dc.html` files: plain HTML with inline styles; read them for layout, copy and tokens; they do not run standalone).
2. Before phase 0, ask me the open question in section 13 and wait.
3. Work through section 12 one phase at a time. For each phase:
   - State the plan and the files you will create or change.
   - Write the tests named in that phase's acceptance checks first.
   - Implement until they pass.
   - Run the full test suite and the type checker.
   - Stop and report: what was built, what was verified, anything you had to decide yourself.
4. Do not start the next phase until I confirm.
5. If this file and the design disagree, follow this file and tell me.

### Hard rules

- **No fabrication.** No text reaches the exported CV unless it is already in the uploaded CV or the user typed or confirmed it. Enforced in code after the model responds (section 5), not left to the prompt.
- **The score is computed in code** by the shared scoring module. Never ask the model for a score.
- **No secret in the browser.** The model API key is read only inside Edge Functions. Nothing prefixed `VITE_` may hold a secret.
- **Schema changes are migration files** in `supabase/migrations/`. Never edit the remote database by hand.
- **Synthetic fixtures only.** Never commit a real CV.
- **Only one module names a model.** All model calls go through `supabase/functions/_shared/model.ts`.

### Commands (create these scripts in phase 0)

| Purpose | Command |
| --- | --- |
| Dev server | `npm run dev` |
| Unit tests | `npm test` (Vitest) |
| Type check | `npm run typecheck` |
| Lint | `npm run lint` |
| Build | `npm run build` (output `dist/`) |
| Apply migrations | `supabase db push --remote` (CLI v3 targets a local stack without `--remote`; there is none here) |
| Deploy functions | `supabase functions deploy <name>` |
| Set model | `supabase secrets set MODEL_ID=<id>` |

The Supabase CLI is a dev dependency: run it as `npx supabase …`. In Windows PowerShell use `npx.cmd` / `npm.cmd`, since script execution is disabled by default.

---

## 1. Decisions (FIXED)

| Decision | Choice | Consequence |
| --- | --- | --- |
| Scope | Standalone tool | No job discovery, no auto-apply, no portal logins |
| Users | Self sign-up for any `@gmail.com` account, separate logins | Supabase Auth with Google sign-in. A `before-user-created` auth hook rejects any email not ending in `@gmail.com`. One profile per login. No profile switcher. (Changed 2026-11-13 from "two invited users".) |
| CV input | PDF upload, single or multi column | The PDF itself is sent to the model so columns are read in the right order |
| JD input | Pasted text or a job link | Paste is the primary path; link fetch is best-effort with a paste fallback |
| Output | One editable single-column DOCX | Used for both portal uploads and recruiter emails. No PDF rendering. |
| Design carry-over | Section order and heading labels from the original CV. Fonts, colours, bullets and name alignment come from the template the user picks (section 9). Changed 2026-11-14 from carrying over font class, accent colour, alignment and bullet style. | Multi-column originals are exported as a single column. Replicating a multi-column design is out of scope for v1. |
| Hosting | Cloudflare Pages, static build from GitHub | No server code on Cloudflare |
| Backend | Supabase: Auth, Postgres, Storage, Edge Functions | All secrets and server logic live here |
| Model | Anthropic API, `MODEL_ID` secret, default `claude-sonnet-5-5` | Also allowed: `claude-haiku-5-5`, `claude-opus-5-5`. Switching needs no code change. |
| Outcome tracking | In v1 | Each application records what happened after applying |

## 2. Goals and non-goals

Success: a tailored, truthful DOCX for one job in under 10 minutes from pasting the JD, with every changed line traceable to something the user wrote or confirmed.

**Goals**
- Score a CV against one JD with a published rubric; same inputs give the same score.
- Show which JD requirements the CV covers, which it misses, and where the evidence sits.
- Propose edits one at a time; apply only accepted ones.
- Export a DOCX that parses cleanly.
- Keep each application's JD, score, decisions, exported file and outcome.

**Non-goals for v1**
- Predicting shortlist odds. The score is a coverage and parse-safety heuristic and the UI says so.
- Replicating multi-column or heavily designed layouts.
- PDF export, cover letters, LinkedIn optimisation, interview prep.
- Job discovery or automated applying.
- Sign-up for non-Gmail accounts, billing.
- An in-app rich text CV editor. Final polish happens in Word.
- A bulk "accept all" action. Do not add one.

---

## 3. Screens and requirements

Four screens in a straight line, matching `docs/design/`:

1. **Applications** (`Main.dc.html`): list of tailorings, master CV card, New tailoring button.
2. **New tailoring** (`New.dc.html`): choose CV, give JD, start analysis.
3. **Score and suggestions** (`Analysis.dc.html`): score, breakdown, JD terms, parse check, suggestion cards.
4. **Export** (`Export.dc.html`): applied edits, gaps left open, DOCX download.

| ID | Screen | Requirement |
| --- | --- | --- |
| F1 | Sign-in | "Continue with Google" via Supabase Auth. Any `@gmail.com` account can sign up and sign in; any other email is rejected with a clear message. |
| F2 | All | Header shows the signed-in user's name, their approximate cumulative AI credits (section 10) and a Sign out button. Each login sees only its own data. |
| F3 | Applications | Table: role, company, JD source, score before and after, status, outcome, updated date. Actions: open, download last export. |
| F4 | Applications | Master CV card: file name, upload date, page count, sections found. Actions: view parsed text, replace PDF. |
| F5 | New tailoring | PDF upload up to 5 MB. Browser extracts text; under 200 characters means scanned: reject with a clear message and do not save. |
| F6 | New tailoring | JD as pasted text (default tab) or URL. A failed fetch shows an inline message and prompts the user to paste. |
| F7 | New tailoring | Role title and company auto-filled from the JD, editable. |
| F8 | Score | Current score, score with accepted edits, five category sub-scores. Disclaimer always visible. |
| F9 | Score | JD terms panel: found and missing. Missing terms show "fix suggested" or "unverified". |
| F10 | Score | Parse check panel with a status per check, and a view of the CV text in browser-extraction order. |
| F11 | Suggestions | Card shows type, CV section, current text, proposed text, evidence, points. Actions: accept, skip, edit wording. Each can be undone. |
| F12 | Suggestions | Accepting or skipping updates the projected score at once, with no network call. |
| F13 | Suggestions | A Quantify suggestion needs the user to type the metric before it can be accepted. |
| F14 | Suggestions | An Unverified keyword suggestion needs the user to confirm they have the experience and say where, before it can be accepted. |
| F15 | Export | Choose one of five templates (section 9), then generate the DOCX from the structured CV plus accepted edits. File name `<Name>_<Role>_<Company>.docx`. |
| F16 | Export | Show applied edits and gaps left unaddressed. |
| F17 | Export | Save the DOCX to Storage against the application; re-download from Applications. |
| F18 | All | Decisions are saved as they are made. Closing the tab loses nothing. |
| F19 | Applications | Outcome dropdown per application: Not applied, Applied, No reply, Recruiter call, Interview, Offer, Rejected. Saved with a timestamp. |
| F20 | Applications | Above the table, show the share of applied applications that reached Recruiter call or beyond, split by final score band (below 70, 70 to 84, 85 and above). Shown only once 10 applications have an outcome. |

### UI tokens (from the design)

| Token | Value |
| --- | --- |
| Page background | `#F4F6F9` |
| Surface | `#FFFFFF` |
| Text | `#14181F` |
| Muted text | `#556070` |
| Border | `#D9DEE6` |
| Accent (actions, accepted, found) | `#1D4FD8`, tint `#E8EEFC`, text on tint `#163BA3` |
| Warning (gaps, unverified) | tint `#FCEFE0`, text `#6E3504` |
| Body font | Inter 400/500/600/700 |
| Heading font | Space Grotesk 500/700 |
| Radius | 10px controls, 14px cards |
| Min control height | 44px |

Rules: status is never conveyed by colour alone (always a text label). Real `<button>`, `<a>`, `<label>` elements. Layout must work at phone width: columns stack, tables scroll inside their box. No emoji.

Fixed copy for the disclaimer: "Out of 100. Measures how well the CV covers this posting and how safely it parses. It does not predict shortlisting."

---

## 4. Scoring rubric

Computed in code from structured data. Pure TypeScript module shared by the browser and tests: `src/lib/scoring.ts`.

| Category | Weight | What is measured | Computation |
| --- | --- | --- | --- |
| Keyword coverage | 35 | Share of JD terms present in the CV | Must-have terms count double nice-to-have. A term counts when the exact phrase or a listed synonym appears. |
| Title and summary fit | 15 | Headline and summary name the target role and domain | 5 points each: role-level match; domain term in summary; top three JD terms in the first 60 words. |
| Evidence and impact | 20 | Share of bullets in the two most recent roles carrying a number and an outcome | `round(20 * quantified_bullets / total_bullets)` |
| Parse safety | 20 | Browser extraction returns the CV in reading order with standard headings | 4 points each: text extractable; single column; standard headings; no text in header or footer region; no tables or text boxes. |
| Hygiene | 10 | Length, date format, contact details, spelling | 2 points each for five checks. |

Rules:
- JD terms are extracted once per application and stored. Re-scoring never re-extracts them.
- Each suggestion carries its category and points. Projected score = base score + points of accepted suggestions, capped at each category's weight.
- After export, recompute the score from the generated document's text. A difference of more than 2 points from the projection is logged as a defect.
- Weights live in one config object so they can be tuned.

---

## 5. Suggestion engine and validation

### Types

| Type | Trigger | User must | Category |
| --- | --- | --- | --- |
| Rewrite | Summary or bullet undersells experience the CV already states | Accept, skip or edit | Title and summary fit, or Evidence and impact |
| Keyword | CV describes the work in different words from the JD | Accept, skip or edit | Keyword coverage |
| Quantify | Bullet in a recent role has no number | Type the metric, then accept | Evidence and impact |
| Unverified keyword | Must-have JD term with no support in the CV | Confirm and say where, then accept | Keyword coverage |
| Format | Parse check failed | Accept (applied by the DOCX template) | Parse safety |
| Hygiene | Date format, length, contact or spelling issue | Accept or skip | Hygiene |

### Validation of every model suggestion (pure module: `supabase/functions/_shared/validate.ts`)

Runs after the model call and before anything is stored.

1. **Evidence check.** Rewrite and Keyword suggestions must return an `evidence_quote`. After whitespace and case normalisation it must be a substring of the CV text. Otherwise drop the suggestion.
2. **Number check.** Any digit sequence in `after_text` must appear in `before_text` or elsewhere in the CV. Otherwise convert to Quantify with the number removed.
3. **Entity check.** `after_text` may not introduce an employer, job title, degree, certification, date or tool name absent from the CV. Compare capitalised tokens and the JD term list against the CV text. A JD term new to the CV converts the suggestion to Unverified keyword.
4. **Length check.** `after_text` is at most 1.3 times the length of `before_text`.
5. **Cap.** At most 12 suggestions per analysis, ranked by points.

Text the user types for Quantify and Unverified keyword is stored with `source = user` and inserted as written.

---

## 6. Architecture

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Front end | Vite, React, TypeScript, Tailwind, shadcn/ui, TanStack Query, React Router | All screens, browser text extraction (`pdfjs-dist`), scoring, DOCX generation (`docx`) |
| Hosting | Cloudflare Pages from GitHub | Static build from `dist`; `public/_redirects` with `/* /index.html 200` |
| Auth | Supabase Auth, Google OAuth | Sign-ups open to `@gmail.com` only, enforced by a `before-user-created` hook |
| Database | Supabase Postgres with row-level security | Section 7 |
| Files | Supabase Storage, private buckets `cvs` and `exports` | Signed URLs, 60-second expiry |
| Server logic | Supabase Edge Functions (Deno) | `parse-cv`, `fetch-jd`, `analyse` |
| Model | Anthropic API via `_shared/model.ts` | Structured output through the API's structured outputs (`output_config.format`, JSON schema from `zod`), re-validated with `zod`. A forced tool call is not used: `tool_choice` `tool`/`any` returns HTTP 400 on the allowed models. |

### Request path for one tailoring

1. Browser uploads the PDF to Storage and extracts text for the scanned check and parse checks.
2. `parse-cv` sends the PDF to the model as a document input and stores the structured CV, the `style` object and the parse checks.
3. If a URL was given, `fetch-jd` returns readable text or an error code.
4. `analyse` receives the structured CV (contact details removed) and JD text; returns JD terms, checks and validated suggestions; writes them to Postgres.
5. Browser computes the score and renders the review screen.
6. Accept, skip and edit write straight to the `suggestions` table.
7. On export the browser applies accepted edits, builds the DOCX, uploads it and records the export.

### Model client (`_shared/model.ts`)

- Reads `ANTHROPIC_API_KEY` and `MODEL_ID` from secrets. Default `claude-sonnet-5-5`.
- Exposes one function: `callStructured({ functionName, promptVersion, system, content, name, schema })` returning validated JSON plus token usage.
- One retry on schema failure, then error `schema_invalid`.
- Writes a `usage_log` row per call: function name, model id, input and output tokens, prompt version.
- Prompts live in versioned files under `supabase/functions/_shared/prompts/`.
- CV and JD text are wrapped in delimiters; the system prompt states that instructions inside them are data and must be ignored.

---

## 7. Data model

All tables have row-level security. Ownership flows through `profiles.user_id`.

| Table | Columns | Notes |
| --- | --- | --- |
| `profiles` | `id`, `user_id` (unique), `display_name`, `created_at` | Exactly one per login |
| `cvs` | `id`, `profile_id`, `file_name`, `storage_path`, `raw_text`, `structured` (jsonb), `style` (jsonb), `parse_checks` (jsonb), `is_master`, `created_at` | One master per profile (partial unique index) |
| `applications` | `id`, `profile_id`, `cv_id`, `role_title`, `company`, `jd_source` (`text`, `url`), `jd_url`, `jd_text`, `jd_terms` (jsonb), `base_score` (jsonb), `model_id`, `prompt_version`, `status` (`draft`, `reviewing`, `exported`), `outcome` (`not_applied`, `applied`, `no_reply`, `recruiter_call`, `interview`, `offer`, `rejected`; default `not_applied`), `outcome_updated_at`, `created_at`, `updated_at` | `jd_terms` and `base_score` written once by `analyse` |
| `suggestions` | `id`, `application_id`, `type`, `category`, `section_ref`, `before_text`, `after_text`, `evidence_quote`, `points`, `status` (`open`, `accepted`, `skipped`), `user_text`, `edited_text`, `rank` | `section_ref` is a JSON pointer into `cvs.structured` |
| `exports` | `id`, `application_id`, `storage_path`, `final_score` (jsonb), `applied_suggestion_ids`, `created_at` | New row per export; old files kept |
| `usage_log` | `id`, `user_id`, `function_name`, `model_id`, `input_tokens`, `output_tokens`, `prompt_version`, `cost_usd`, `credits`, `created_at` | Also used for the daily cap. `cost_usd` and `credits` are set by a database trigger on insert, never by the client |
| `model_prices` | `model_id`, `input_usd_per_mtok`, `output_usd_per_mtok`, `updated_at` | List prices; change them with a migration. Read-only to users |

### Structured CV

```json
{
  "contact": { "name": "", "email": "", "phone": "", "location": "", "links": [] },
  "headline": "",
  "summary": "",
  "experience": [
    { "company": "", "title": "", "location": "", "start": "", "end": "", "bullets": [""] }
  ],
  "education": [ { "institution": "", "degree": "", "start": "", "end": "" } ],
  "skills": [""],
  "other": [ { "heading": "", "items": [""] } ]
}
```

### Style object

```json
{
  "section_order": ["summary", "experience", "education", "skills"],
  "heading_labels": { "summary": "Summary", "experience": "Experience" },
  "font_class": "sans",
  "accent_color": "#1F3A5F",
  "name_align": "left",
  "bullet_style": "disc",
  "source_columns": 1
}
```

### Row-level security

- `profiles`: `user_id = auth.uid()` for all operations.
- Other tables: allowed when the row's profile belongs to `auth.uid()`, via a `security definer` helper `owns_profile(profile_id)`.
- Storage: object paths start with the profile id; policies use the same helper.
- Edge Functions use the caller's JWT, not the service role key.

---

## 8. Edge function contracts

All require a valid Supabase JWT. Error shape: `{ "error": { "code": "", "message": "" } }`.

| Function | Input | Output | Error codes |
| --- | --- | --- | --- |
| `parse-cv` | `{ cv_id }` (reads the PDF from Storage) | Writes and returns `structured`, `style`, `parse_checks` | `cv_not_found`, `scanned_pdf`, `model_error`, `schema_invalid` |
| `fetch-jd` | `{ url }` | `{ text, title, company }` | `invalid_url`, `fetch_failed`, `login_wall`, `too_short` |
| `analyse` | `{ application_id, force? }` | Writes and returns `jd_terms`, check results, `suggestions` | `not_found`, `jd_too_short`, `model_error`, `schema_invalid`, `daily_cap` |

- `analyse` output schema: `jd_terms[]` with `term`, `synonyms[]`, `importance` (`must`, `nice`), `jd_count`, `found_in_cv`; `checks{}` for title, summary and hygiene; `suggestions[]` matching the table.
- `fetch-jd`: HTTPS only, public pages only, 10-second timeout, 1 MB cap, no cookies. Under 500 characters of readable text, or a sign-in form detected, returns `login_wall`. Never attempt to get around a login.
- `analyse` is idempotent: if suggestions exist, return them unless `force: true`.
- Daily cap: 30 `analyse` calls per user.

---

## 9. DOCX generation

Built in the browser with the `docx` library from the structured CV, accepted edits and the `style` object. Module: `src/lib/docx/`.

Templates (changed 2026-11-14). The user picks one of five templates on the Export screen. Definitions live in one module, `src/lib/docx/templates.ts`.

| Template | Fonts (embedded in the DOCX) | Look |
| --- | --- | --- |
| Slate (default) | Inter, Inter Light | Light first name, bold surname, tracked capital headings in the accent with a hairline rule |
| Terminal | Space Grotesk, IBM Plex Sans, IBM Plex Mono | Headings followed by a dotted rule (right tab with dot leader), monospace dates and contact |
| Axis | Sora, Sora Light, Sora SemiBold | Centred, widely tracked name and headings, short rule under each heading |
| Band | DM Sans, DM Sans Medium, DM Sans ExtraBold | Name, role and contact on a dark shaded band running to the page edges |
| Tint | Plus Jakarta Sans, Plus Jakarta Sans ExtraBold | Section headings on light shaded bands |

Font files are static TTFs from Google Fonts (SIL Open Font License, licences in `public/fonts/licenses/`), fetched only when exporting and embedded so Word shows them; Google Docs has them natively.

Template rules (all templates):
- Single column, A4, 2 cm side margins, 10 to 11 pt body.
- Fonts, colours, bullet glyph and name alignment come from the template. Section order and heading labels come from the CV's `style` (`section_order`, `heading_labels`).
- Every text colour has at least 4.5:1 contrast against what it sits on, including text on a shaded band.
- Contact details are body paragraphs, never in the Word header or footer.
- Sections use Word's built-in Heading styles. If a label is non-standard (for example "Career Journey"), keep the user's label and record a parse-safety Format suggestion to rename it.
- Each role: company and title on one line, dates right-aligned with a tab stop, bullets as real Word list items.
- No tables, text boxes, columns, images or icons. Paragraph shading is allowed only for a header band and for section-heading bands; nothing else has a background.
- Dates as `MMM YYYY`; current role ends with `Present`.
- Content under `other` is kept, not dropped.

Apply logic:
1. Deep-copy `cvs.structured`.
2. For each accepted suggestion in `rank` order, replace the text at `section_ref` with `edited_text` if present, else `after_text` with any `user_text` merged in.
3. If two accepted suggestions target the same `section_ref`, apply the higher-ranked one and flag the other as conflicting on the review screen before export.
4. Build the document, re-extract its text, recompute the score, upload, insert the `exports` row.

---

## 10. Privacy, cost, failures

**Privacy**
- Private buckets, signed URLs expiring in 60 seconds.
- Contact details are removed from what is sent to `analyse`.
- Deleting a CV or application removes its rows and files.
- No analytics or third-party scripts.

**Cost**
- One `parse-cv` call per CV, one `analyse` call per application. Token usage logged from phase 0.
- AI credits (added 2026-11-14): 1 credit = USD 0.01 of model cost at list prices. A trigger prices each `usage_log` row from `model_prices` (an unknown model is charged at the highest listed rate). `my_usage()` returns the caller's total, this month and call count for the header; the `usage_by_user` view gives per-user totals to the project owner only. This is the basis for a later fair-use limit, free allowance or paid plan.

**Failures**

| Failure | What the user sees |
| --- | --- |
| PDF has no extractable text | "This PDF looks scanned. Upload a text-based PDF." Upload not saved. |
| Multi-column PDF | Analysis continues; parse check flags it; the export is single column. |
| Job link blocked or behind login | Inline message on the Job link tab and a prompt to paste. |
| Model call fails or times out | Retry button; application stays in `draft` with inputs preserved. |
| Model output fails validation twice | "Analysis failed. Try again." Failure and prompt version logged. |
| All suggestions dropped by validation | Score and term coverage shown, with "No safe edits found" in place of the list. |
| Daily cap reached | "Daily analysis limit reached. Try again tomorrow." |

---

## 11. Repository layout

```
docs/design/                     four .dc.html reference files
public/_redirects
src/
  lib/scoring.ts                 pure, unit-tested
  lib/applyEdits.ts              pure, unit-tested
  lib/pdfText.ts                 pdfjs-dist wrapper
  lib/docx/                      template and builder
  lib/supabase.ts
  hooks/                         TanStack Query hooks
  pages/                         Applications, NewTailoring, Analysis, Export, SignIn
  components/
supabase/
  migrations/
  functions/
    _shared/model.ts
    _shared/validate.ts          pure, unit-tested
    _shared/prompts/
    parse-cv/  fetch-jd/  analyse/
tests/fixtures/                  synthetic CVs and JDs only
```

---

## 12. Build phases

| Phase | Builds | Acceptance checks |
| --- | --- | --- |
| 0. Scaffold | Vite app, Tailwind, shadcn/ui, Supabase client, Google sign-in, Gmail-only sign-up hook, all migrations and policies, `_shared/model.ts`, `usage_log`, Cloudflare Pages deploy | Deployed URL loads. A Gmail account signs up and signs in; a non-Gmail email is rejected by the hook (automated test). A second user cannot read the first user's rows (automated RLS test). Changing `MODEL_ID` changes the model recorded in `usage_log` with no code change. |
| 1. CV intake | Upload, browser extraction, scanned rejection, `parse-cv` with PDF input, `style` extraction, master CV card, parsed-text view | Fixtures: single column, two column, scanned. Single column: every bullet appears in `structured`. Two column: same bullets in the same role order as its single-column twin. Scanned: rejected. |
| 2. JD intake and analysis | New tailoring screen, `fetch-jd`, `analyse`, scoring module | Same CV and JD give the same base score on five runs. A public job page fetches; a login-walled one returns `login_wall`. Unit tests for each scoring category. |
| 3. Suggestions | Validation layer, cards, accept, skip, edit, undo, live projected score, Quantify and Unverified keyword rules | A fixture model response with an invented number, an invented employer and a false evidence quote has all three dropped or converted. Toggling a card changes the score with no network call. Decisions survive a reload. |
| 4. Export | Apply logic, DOCX template with style carry-over, upload, Export screen, re-download | Round-trip: generated DOCX converted to text contains every heading and bullet in order. Recomputed score within 2 points of projection. Opens in Word and Google Docs with real headings and list items. A serif, coloured-heading fixture exports serif with that colour. |
| 5. Outcomes and hardening | Outcome dropdown (F19), outcome summary (F20), failure states, daily cap, delete flows, prompt-injection test, empty states, phone-width check | A JD instructing the model to add a fake degree produces no such suggestion. Each failure in section 10 is reproduced and shows its message. Outcome changes persist with a timestamp. |

**Stop gate after phase 3:** report honestly whether the review screen is faster than doing the same job in a chat. I will decide whether to continue.

---

## 13. Open question (answered)

- Different section labels or rubric weights per user? No: every user gets the default labels and the single weights config (answered 2026-11-13).

## 14. Known risks (context, not tasks)

- The score has no proven link to shortlisting. The outcome field exists to test this after about 20 applications.
- Rubric weights are a judgement call; keep them in one config object.
- Open Gmail sign-up means anyone can create an account and spend model tokens on the shared API key. The per-user daily cap limits each account, not the total; watch `usage_log`.
- Validation is heuristic. The user's review of each card is the real safeguard, which is why there is no accept-all.
