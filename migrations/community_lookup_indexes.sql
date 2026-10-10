-- Indexes for Community profile/history lookups and foreign-key cleanups.
create index if not exists posts_user_idx on public.posts(user_id);
create index if not exists comments_user_idx on public.comments(user_id);
create index if not exists comments_parent_idx on public.comments(parent_id) where parent_id is not null;
create index if not exists post_likes_user_idx on public.post_likes(user_id);
create index if not exists comment_likes_user_idx on public.comment_likes(user_id);
create index if not exists post_saves_user_idx on public.post_saves(user_id);
