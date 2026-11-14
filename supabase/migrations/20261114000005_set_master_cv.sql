-- Atomically make one CV the profile's master. Runs as the caller, so RLS applies:
-- a CV the caller cannot see raises cv_not_found.
create function public.set_master_cv(p_cv_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile uuid;
begin
  select profile_id into v_profile from public.cvs where id = p_cv_id;
  if v_profile is null then
    raise exception 'cv_not_found' using errcode = 'P0002';
  end if;
  update public.cvs set is_master = false where profile_id = v_profile and is_master and id <> p_cv_id;
  update public.cvs set is_master = true where id = p_cv_id;
end;
$$;

revoke all on function public.set_master_cv(uuid) from public, anon;
grant execute on function public.set_master_cv(uuid) to authenticated;
