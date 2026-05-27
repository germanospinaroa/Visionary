insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'survey-images',
    'survey-images',
    false,
    20971520,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
    'question-screenshots',
    'question-screenshots',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'analysis-artifacts',
    'analysis-artifacts',
    false,
    20971520,
    array['application/json', 'image/jpeg', 'image/png', 'image/webp', 'text/plain']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pilot_authenticated_read_storage" on storage.objects;
create policy "pilot_authenticated_read_storage"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('survey-images', 'question-screenshots', 'analysis-artifacts')
);

drop policy if exists "pilot_authenticated_insert_storage" on storage.objects;
create policy "pilot_authenticated_insert_storage"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('survey-images', 'question-screenshots', 'analysis-artifacts')
);

drop policy if exists "pilot_authenticated_update_storage" on storage.objects;
create policy "pilot_authenticated_update_storage"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('survey-images', 'question-screenshots', 'analysis-artifacts')
)
with check (
  bucket_id in ('survey-images', 'question-screenshots', 'analysis-artifacts')
);

drop policy if exists "pilot_authenticated_delete_storage" on storage.objects;
create policy "pilot_authenticated_delete_storage"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('survey-images', 'question-screenshots', 'analysis-artifacts')
);
