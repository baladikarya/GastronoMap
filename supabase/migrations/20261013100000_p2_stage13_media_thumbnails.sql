-- P2 Tahap 13: thumbnails for Community feeds and stable comment paging.
-- Additive; no existing posts or media URLs are modified.
alter table public.post_media
  add column if not exists thumbnail_url text;

-- The primary feed already uses posts_created_idx (created_at DESC, id DESC).
-- Comment paging sorts by (post_id, created_at, id) to keep offsets predictable.
create index if not exists comments_post_page_idx
  on public.comments (post_id, created_at asc, id asc);

-- Existing post_media RLS, storage upload rules and table grants also cover thumbnails.
-- Each thumbnail is stored inside the existing author/post path, using a random filename.
