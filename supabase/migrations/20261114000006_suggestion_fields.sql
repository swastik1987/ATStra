-- Suggestion fields needed by the review screen (CLAUDE.md sections 5, 9).
-- term:      the JD term a Keyword or Unverified keyword suggestion is about.
-- source:    'user' once the text that will be inserted was typed by the user
--            (Quantify metric, Unverified keyword wording, Edit wording).
-- confirmed: the user confirmed they have the experience (Unverified keyword).
alter table public.suggestions
  add column term text not null default '',
  add column source text not null default 'model' check (source in ('model', 'user')),
  add column confirmed boolean not null default false,
  add column updated_at timestamptz not null default now();

create function public.touch_suggestion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger suggestions_touch
before update on public.suggestions
for each row execute function public.touch_suggestion();

create index suggestions_application_rank_idx on public.suggestions (application_id, rank);
