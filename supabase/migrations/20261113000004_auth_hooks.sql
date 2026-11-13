-- Gmail-only sign-up and automatic profile creation.

-- Before-user-created auth hook: reject any email that is not @gmail.com.
-- Enable it in Supabase: Authentication > Hooks > Before User Created > Postgres function
-- public.hook_gmail_only (or via supabase/config.toml + `supabase config push`).
create function public.hook_gmail_only(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if email like '%@gmail.com' then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Only Gmail accounts can sign up for CV Tailor.'
    )
  );
end;
$$;

grant execute on function public.hook_gmail_only(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_gmail_only(jsonb) from public, anon, authenticated;

-- Exactly one profile per login, created when the auth user is created.
create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

revoke execute on function public.create_profile_for_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.create_profile_for_new_user();
