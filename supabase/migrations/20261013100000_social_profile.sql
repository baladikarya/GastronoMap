-- P2 / Tahap 11 — Social Profile. Additive, safe for existing accounts.
-- Apply after existing Community and Notifications migrations.
create table if not exists public.user_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_follows_pkey primary key (follower_id, following_id),
  constraint user_follows_no_self check (follower_id <> following_id)
);

create index if not exists user_follows_following_recent_idx
  on public.user_follows (following_id, created_at desc);
create index if not exists user_follows_follower_recent_idx
  on public.user_follows (follower_id, created_at desc);

alter table public.user_follows enable row level security;
drop policy if exists user_follows_read on public.user_follows;
create policy user_follows_read on public.user_follows
  for select to anon, authenticated using (true);
drop policy if exists user_follows_insert_own on public.user_follows;
create policy user_follows_insert_own on public.user_follows
  for insert to authenticated with check ((select auth.uid()) = follower_id and follower_id <> following_id);
drop policy if exists user_follows_delete_own on public.user_follows;
create policy user_follows_delete_own on public.user_follows
  for delete to authenticated using ((select auth.uid()) = follower_id);
revoke all on public.user_follows from public, anon, authenticated;
grant select on public.user_follows to anon, authenticated;
grant insert (follower_id, following_id), delete on public.user_follows to authenticated;

-- Keep the existing Leaderboard projection untouched; its columns differ across installs.
-- Public social view exposes only explicit, non-sensitive profile fields.
create or replace view public.public_social_profiles as
select id, username, avatar_url, bio, city,
       is_verified_contributor, resto_approved_count, full_review_count
from public.profiles;
revoke all on public.public_social_profiles from public, anon, authenticated;
grant select on public.public_social_profiles to anon, authenticated;

-- Follow is an interaction notification. Keep the previous allowed kinds.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
check (kind in ('like','comment','reply','report','link',
               'resto_submitted','resto_verified','contribution','follow'));

-- A fixed trigger (no user-supplied SQL) is allowed to create a notification
-- for the followed account even though users cannot insert into notifications.
create or replace function public.gm_notify_new_follow()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_username text;
begin
  select nullif(trim(p.username), '') into v_username
  from public.profiles p where p.id = new.follower_id;
  insert into public.notifications
    (user_id, actor_id, kind, title, message, event_key)
  values
    (new.following_id, new.follower_id, 'follow', 'Pengikut baru',
     coalesce(left(v_username, 40), 'Seseorang') || ' mulai mengikuti Anda.',
     'follow:' || new.follower_id::text || ':' || new.following_id::text)
  on conflict (event_key) do update
    set created_at = now(),
        read_at = null,
        message = excluded.message;
  return new;
end;
$$;
revoke all on function public.gm_notify_new_follow() from public, anon, authenticated;
drop trigger if exists gm_user_follows_notify on public.user_follows;
create trigger gm_user_follows_notify
after insert on public.user_follows
for each row execute function public.gm_notify_new_follow();
