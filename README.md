# ATStra

Tailor a CV to one job without making anything up.

ATStra scores a CV against a job description, shows which requirements it covers and which it misses, and proposes evidence-backed edits one at a time. Accepted edits are exported as an editable, single-column Word file (DOCX) in one of five ATS-friendly templates.

Live at **https://atstra.pages.dev**. Sign-up is open to any Gmail account through Google sign-in.

> The full product specification, including the fixed decisions, scoring rubric, data model and function contracts, is in [CLAUDE.md](CLAUDE.md). This README covers running and deploying the code.

## What it does

- **Score.** A deterministic score out of 100, computed in code from a published rubric: keyword coverage (35), evidence and impact (20), parse safety (20), title and summary fit (15) and hygiene (10). It measures coverage and parse safety. It does not predict shortlisting.
- **Suggest.** Up to 12 edits per job, each showing the current text, the proposed text, the evidence quoted from the CV and the points it is worth. There is no accept-all button.
- **Stay truthful.** Every model suggestion is checked in code before it is stored ([`validate.ts`](supabase/functions/_shared/validate.ts)). A suggestion with a false evidence quote is dropped. A new number becomes a Quantify card that asks the user for the figure. A skill the CV does not support becomes an Unverified keyword card that the user must confirm.
- **Export.** Five templates (Slate, Terminal, Axis, Band and Tint) with their fonts embedded, real Word headings and bullet lists, and no tables, text boxes or images. The exported file is re-read and re-scored as a check.
- **Track.** Each application keeps its job description, scores, decisions, exported files and outcome, from Applied to Offer.
- **Meter.** Every model call is priced into AI credits (1 credit = US$0.01 of model cost), shown next to the user's name.

## Stack

| Layer | Technology |
| --- | --- |
| Front end | Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query, React Router |
| In the browser | PDF text extraction (`pdfjs-dist`), scoring, DOCX generation (`docx`) |
| Hosting | Cloudflare Pages, static build from `main` |
| Backend | Supabase: Auth (Google), Postgres with row-level security, Storage, Edge Functions (Deno) |
| Model | Anthropic API (`claude-sonnet-5-5` by default), structured outputs validated with `zod` |

No secret reaches the browser. The Anthropic API key is read only inside the Edge Functions.

## Repository layout

```
docs/design/              UI reference (static HTML)
public/                   fonts for the templates, icons, robots.txt, sitemap
src/
  pages/                  Landing, Applications, NewTailoring, Analysis, Export, CvText
  components/             header, review cards, template picker, landing sections
  hooks/                  TanStack Query hooks (CVs, applications, exports, usage)
  lib/                    scoring, apply-edits, PDF text, DOCX builder and templates
supabase/
  migrations/             every schema change, in order
  functions/
    _shared/              model client, validation, scoring, prompts (shared with the browser)
    parse-cv/  fetch-jd/  analyse/
tests/                    Vitest suites; tests/fixtures holds synthetic CVs and JDs only
scripts/make-fixtures.mjs regenerates the synthetic PDF fixtures
```

## Getting started

Needs Node.js 22 or later.

```bash
npm install
cp .env.example .env.local
```

Fill in `VITE_SUPABASE_ANON_KEY` in `.env.local` from the Supabase dashboard (Project Settings, API). Both values in that file are public by design. Then:

```bash
npm run dev
```

On Windows PowerShell, use `npm.cmd` and `npx.cmd`, since script execution is disabled by default.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm test` | All tests (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run build` | Type check and production build into `dist/` |

### Tests

`npm test` runs the unit and component tests. Suites that need the real Supabase project skip themselves unless `.env.test` exists:

```bash
cp .env.test.example .env.test
```

Fill in the anon key and the service role key. The service role key is a secret: keep it in `.env.test` only (git-ignored), never in a `VITE_` variable. These suites create throwaway users and delete them afterwards. They cover row-level security, the Gmail-only sign-up hook and usage pricing.

The `*.live.test.ts` suites that call the model spend real tokens, so they also need `RUN_LIVE_MODEL_TESTS=1`.

To write one sample DOCX per template into `samples/` (git-ignored) for checking in Word:

```bash
WRITE_SAMPLE_DOCX=1 npx vitest run tests/sampleDocx.test.ts
```

## Backend (Supabase)

The Supabase CLI is a dev dependency, so run it through `npx`.

| Task | Command |
| --- | --- |
| Apply migrations | `npx supabase db push --remote` |
| Deploy a function | `npx supabase functions deploy <parse-cv \| fetch-jd \| analyse>` |
| Set the API key | `npx supabase secrets set ANTHROPIC_API_KEY=<key>` |
| Switch the model | `npx supabase secrets set MODEL_ID=<claude-sonnet-5-5 \| claude-haiku-5-5 \| claude-opus-5-5>` |

Schema changes are always new files in `supabase/migrations/`. Never edit the remote database by hand.

Google sign-in is configured in the Supabase dashboard (Authentication, Providers) with an OAuth client from Google Cloud. The `before-user-created` hook (`hook_gmail_only`) rejects any email that does not end in `@gmail.com`.

## Usage and credits

Each model call writes a `usage_log` row. A database trigger prices it from the `model_prices` table, so clients cannot set their own figure. To see totals per user, run this in the dashboard SQL editor:

```sql
select u.email, b.*
from public.usage_by_user b
join auth.users u on u.id = b.user_id
order by b.total_credits desc;
```

Each user is limited to 30 analyses a day. Sign-up is open, so watch total usage: the daily cap limits each account, not the overall spend.

## Deploying

Pushing to `main` deploys the front end through Cloudflare Pages: build command `npm run build`, output directory `dist`, and `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set as environment variables. `public/_redirects` sends every path to `index.html` for client-side routing.

Edge Functions and migrations are deployed separately with the Supabase commands above.

## Privacy

- CVs and exports live in private storage buckets. Download links expire after 60 seconds.
- Contact details are removed before a CV is sent for job analysis.
- Deleting a CV or application deletes its rows and files.
- No analytics or third-party scripts.
- Test fixtures are synthetic. Never commit a real CV.

## Licences

The template fonts are from Google Fonts under the SIL Open Font License. Their licence files are in [`public/fonts/licenses/`](public/fonts/licenses/).
