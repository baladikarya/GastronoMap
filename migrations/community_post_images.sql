-- Community posting photos: private write access, public viewing.
-- Additive migration for GastronoMap P1 Community.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-posts', 'community-posts', true, 6291456, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "community image upload by post author"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'community-posts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.posts p
    where p.id::text = (storage.foldername(name))[2]
      and p.user_id = (select auth.uid())
  )
);

create policy "community image owner can list"
on storage.objects for select to authenticated
using (
  bucket_id = 'community-posts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "community image owner can remove"
on storage.objects for delete to authenticated
using (
  bucket_id = 'community-posts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
