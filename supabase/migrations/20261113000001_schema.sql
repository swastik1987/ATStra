-- Core schema for CV Tailor (CLAUDE.md section 7).

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.cvs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  raw_text text,
  structured jsonb,
  style jsonb,
  parse_checks jsonb,
  is_master boolean not null default false,
  created_at timestamptz not null default now()
);
create index cvs_profile_id_idx on public.cvs (profile_id);
create unique index cvs_one_master_per_profile on public.cvs (profile_id) where is_master;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  cv_id uuid references public.cvs (id) on delete set null,
  role_title text not null default '',
  company text not null default '',
  jd_source text not null check (jd_source in ('text', 'url')),
  jd_url text,
  jd_text text,
  jd_terms jsonb,
  base_score jsonb,
  model_id text,
  prompt_version text,
  status text not null default 'draft' check (status in ('draft', 'reviewing', 'exported')),
  outcome text not null default 'not_applied'
    check (outcome in ('not_applied', 'applied', 'no_reply', 'recruiter_call', 'interview', 'offer', 'rejected')),
  outcome_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index applications_profile_id_idx on public.applications (profile_id);
create index applications_cv_id_idx on public.applications (cv_id);

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  type text not null
    check (type in ('rewrite', 'keyword', 'quantify', 'unverified_keyword', 'format', 'hygiene')),
  category text not null
    check (category in ('keyword_coverage', 'title_summary', 'evidence_impact', 'parse_safety', 'hygiene')),
  section_ref text not null,
  before_text text,
  after_text text,
  evidence_quote text,
  points numeric not null default 0 check (points >= 0),
  status text not null default 'open' check (status in ('open', 'accepted', 'skipped')),
  user_text text,
  edited_text text,
  rank integer not null
);
create index suggestions_application_id_idx on public.suggestions (application_id);

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  storage_path text not null,
  final_score jsonb,
  applied_suggestion_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index exports_application_id_idx on public.exports (application_id);

create table public.usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  function_name text not null,
  model_id text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  prompt_version text not null default '',
  created_at timestamptz not null default now()
);
create index usage_log_user_created_idx on public.usage_log (user_id, created_at);

-- Keep updated_at current; stamp outcome changes (F19).
create function public.touch_application()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.outcome is distinct from old.outcome then
    new.outcome_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger applications_touch
before update on public.applications
for each row execute function public.touch_application();
