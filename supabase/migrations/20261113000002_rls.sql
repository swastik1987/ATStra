-- Row-level security (CLAUDE.md section 7). Ownership flows through profiles.user_id.

create function public.owns_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_profile_id and user_id = (select auth.uid())
  );
$$;

create function public.owns_application(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.applications a
    join public.profiles p on p.id = a.profile_id
    where a.id = p_application_id and p.user_id = (select auth.uid())
  );
$$;

create function public.owns_cv(p_cv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cvs c
    join public.profiles p on p.id = c.profile_id
    where c.id = p_cv_id and p.user_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_profile(uuid) from public, anon;
revoke all on function public.owns_application(uuid) from public, anon;
revoke all on function public.owns_cv(uuid) from public, anon;
grant execute on function public.owns_profile(uuid) to authenticated;
grant execute on function public.owns_application(uuid) to authenticated;
grant execute on function public.owns_cv(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.cvs enable row level security;
alter table public.applications enable row level security;
alter table public.suggestions enable row level security;
alter table public.exports enable row level security;
alter table public.usage_log enable row level security;

-- profiles: created by trigger only; users read and rename their own.
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- cvs
create policy cvs_all on public.cvs for all to authenticated
  using (public.owns_profile(profile_id))
  with check (public.owns_profile(profile_id));

-- applications: the referenced CV must belong to the same user.
create policy applications_all on public.applications for all to authenticated
  using (public.owns_profile(profile_id))
  with check (public.owns_profile(profile_id) and (cv_id is null or public.owns_cv(cv_id)));

-- suggestions and exports: through the application.
create policy suggestions_all on public.suggestions for all to authenticated
  using (public.owns_application(application_id))
  with check (public.owns_application(application_id));

create policy exports_all on public.exports for all to authenticated
  using (public.owns_application(application_id))
  with check (public.owns_application(application_id));

-- usage_log: append and read own rows; no update or delete (it backs the daily cap).
create policy usage_log_select on public.usage_log for select to authenticated
  using (user_id = (select auth.uid()));
create policy usage_log_insert on public.usage_log for insert to authenticated
  with check (user_id = (select auth.uid()));
