-- Private buckets; object paths start with the owner's profile id (CLAUDE.md sections 6, 7).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cvs', 'cvs', false, 5242880, array['application/pdf']),
  ('exports', 'exports', false, 10485760,
    array['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

-- Returns null instead of raising when the first path segment is not a uuid.
create function public.path_profile_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then
  return null;
end;
$$;

create policy storage_owner_select on storage.objects for select to authenticated
  using (bucket_id in ('cvs', 'exports') and public.owns_profile(public.path_profile_id(name)));

create policy storage_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('cvs', 'exports') and public.owns_profile(public.path_profile_id(name)));

create policy storage_owner_update on storage.objects for update to authenticated
  using (bucket_id in ('cvs', 'exports') and public.owns_profile(public.path_profile_id(name)))
  with check (bucket_id in ('cvs', 'exports') and public.owns_profile(public.path_profile_id(name)));

create policy storage_owner_delete on storage.objects for delete to authenticated
  using (bucket_id in ('cvs', 'exports') and public.owns_profile(public.path_profile_id(name)));
