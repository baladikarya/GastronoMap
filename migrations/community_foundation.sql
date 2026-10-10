-- P1 Tahap 6: Community foundation. Additive migration; never run the reset schema on production.
create table if not exists public.posts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 resto_id uuid references public.restos(id) on delete set null,
 caption text not null default '' check (char_length(caption) <= 5000),
 location_name text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists posts_created_idx on public.posts(created_at desc, id desc);
create index if not exists posts_resto_idx on public.posts(resto_id);
create table if not exists public.post_media (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null references public.posts(id) on delete cascade,
 url text not null,
 position integer not null default 0 check(position >= 0),
 created_at timestamptz not null default now(),
 unique(post_id,position)
);
create table if not exists public.post_likes (
 post_id uuid not null references public.posts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
create table if not exists public.comments (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null references public.posts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 parent_id uuid references public.comments(id) on delete cascade,
 body text not null check(char_length(trim(body)) between 1 and 2000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments(post_id,created_at);
create table if not exists public.comment_likes (
 comment_id uuid not null references public.comments(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(comment_id,user_id)
);
create table if not exists public.post_saves (
 post_id uuid not null references public.posts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_likes enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.post_saves enable row level security;
create policy "posts readable" on public.posts for select to anon,authenticated using (true);
create policy "posts owned insert" on public.posts for insert to authenticated with check ((select auth.uid())=user_id);
create policy "posts owned update" on public.posts for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "posts owned delete" on public.posts for delete to authenticated using ((select auth.uid())=user_id);
create policy "media readable" on public.post_media for select to anon,authenticated using (true);
create policy "media owner insert" on public.post_media for insert to authenticated with check (exists(select 1 from public.posts p where p.id=post_id and p.user_id=(select auth.uid())));
create policy "media owner update" on public.post_media for update to authenticated using (exists(select 1 from public.posts p where p.id=post_id and p.user_id=(select auth.uid()))) with check (exists(select 1 from public.posts p where p.id=post_id and p.user_id=(select auth.uid())));
create policy "media owner delete" on public.post_media for delete to authenticated using (exists(select 1 from public.posts p where p.id=post_id and p.user_id=(select auth.uid())));
create policy "likes readable" on public.post_likes for select to anon,authenticated using (true);
create policy "likes self insert" on public.post_likes for insert to authenticated with check (user_id=(select auth.uid()));
create policy "likes self delete" on public.post_likes for delete to authenticated using (user_id=(select auth.uid()));
create policy "comments readable" on public.comments for select to anon,authenticated using (true);
create policy "comments self insert" on public.comments for insert to authenticated with check (user_id=(select auth.uid()) and (parent_id is null or exists(select 1 from public.comments c where c.id=parent_id and c.post_id=comments.post_id)));
create policy "comments self update" on public.comments for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "comments self delete" on public.comments for delete to authenticated using (user_id=(select auth.uid()));
create policy "comment likes readable" on public.comment_likes for select to anon,authenticated using (true);
create policy "comment likes self insert" on public.comment_likes for insert to authenticated with check (user_id=(select auth.uid()));
create policy "comment likes self delete" on public.comment_likes for delete to authenticated using (user_id=(select auth.uid()));
create policy "saves self read" on public.post_saves for select to authenticated using (user_id=(select auth.uid()));
create policy "saves self insert" on public.post_saves for insert to authenticated with check (user_id=(select auth.uid()));
create policy "saves self delete" on public.post_saves for delete to authenticated using (user_id=(select auth.uid()));
grant select on public.posts,public.post_media,public.post_likes,public.comments,public.comment_likes to anon;
grant select,insert,update,delete on public.posts,public.post_media,public.comments to authenticated;
grant select,insert,delete on public.post_likes,public.comment_likes,public.post_saves to authenticated;
