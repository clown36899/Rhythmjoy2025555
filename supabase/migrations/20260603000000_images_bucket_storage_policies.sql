-- Ensure the app's public image bucket and client upload policies are reproducible locally.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'images',
  'images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'images public select'
  ) then
    create policy "images public select"
    on storage.objects
    for select
    using (bucket_id = 'images');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'images authenticated insert'
  ) then
    create policy "images authenticated insert"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'images'
      and (storage.foldername(name))[1] in (
        'event-posters',
        'board-images',
        'profiles',
        'social-groups',
        'social-schedules',
        'venue-images',
        'shop-logos',
        'default-thumbnails',
        'webzine',
        'v2-main-ads'
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'images owner update'
  ) then
    create policy "images owner update"
    on storage.objects
    for update
    to authenticated
    using (bucket_id = 'images' and (owner = auth.uid() or owner_id = auth.uid()::text))
    with check (bucket_id = 'images' and (owner = auth.uid() or owner_id = auth.uid()::text));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'images owner delete'
  ) then
    create policy "images owner delete"
    on storage.objects
    for delete
    to authenticated
    using (bucket_id = 'images' and (owner = auth.uid() or owner_id = auth.uid()::text));
  end if;
end $$;
