insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'error-screenshots',
    'error-screenshots',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pilot_authenticated_read_error_screenshots" on storage.objects;
create policy "pilot_authenticated_read_error_screenshots"
on storage.objects
for select
to authenticated
using (bucket_id = 'error-screenshots');

drop policy if exists "pilot_authenticated_insert_error_screenshots" on storage.objects;
create policy "pilot_authenticated_insert_error_screenshots"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'error-screenshots');

drop policy if exists "pilot_authenticated_update_error_screenshots" on storage.objects;
create policy "pilot_authenticated_update_error_screenshots"
on storage.objects
for update
to authenticated
using (bucket_id = 'error-screenshots')
with check (bucket_id = 'error-screenshots');

drop policy if exists "pilot_authenticated_delete_error_screenshots" on storage.objects;
create policy "pilot_authenticated_delete_error_screenshots"
on storage.objects
for delete
to authenticated
using (bucket_id = 'error-screenshots');
