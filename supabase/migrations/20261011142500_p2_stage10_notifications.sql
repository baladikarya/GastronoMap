-- P2 Tahap 10: server-generated notification events and cross-device state.
-- Additive migration; no existing user or restaurant data is deleted.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('like','comment','reply','report','link','resto_submitted','resto_verified','contribution')),
  title text not null,
  message text not null default '',
  post_id uuid references public.posts(id) on delete set null,
  resto_id uuid references public.restos(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  link_submission_id uuid references public.online_link_submissions(id) on delete set null,
  event_key text unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_recent_idx on public.notifications (user_id, created_at desc, id desc);
create index if not exists notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
alter table public.notifications enable row level security;
drop policy if exists "notifications_read_own" on public.notifications;
create policy "notifications_read_own" on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update to authenticated
 using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, update on public.notifications to authenticated;
revoke insert, delete on public.notifications from anon, authenticated;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  interaction boolean not null default true,
  system boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;
drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own" on public.notification_preferences for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own" on public.notification_preferences for insert to authenticated with check ((select auth.uid())=user_id);
drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own" on public.notification_preferences for update to authenticated
 using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select, insert, update on public.notification_preferences to authenticated;

-- Only triggers can create notification events. Privileged code is not exposed via Data API.
create schema if not exists private;
create or replace function private.gm_notification_actor(p_user uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce(nullif(left(username,80),''),'Pengguna GastronoMap')
  from public.profiles where id=p_user
$$;
create or replace function private.gm_push_notification(
  p_user uuid, p_actor uuid, p_kind text, p_title text, p_message text,
  p_post uuid default null, p_resto uuid default null,
  p_report uuid default null, p_link uuid default null, p_key text default null
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_user is null or (p_actor is not null and p_user=p_actor) then return; end if;
  insert into public.notifications(user_id,actor_id,kind,title,message,post_id,resto_id,report_id,link_submission_id,event_key)
  values(p_user,p_actor,p_kind,left(p_title,200),left(coalesce(p_message,''),500),p_post,p_resto,p_report,p_link,p_key)
  on conflict(event_key) do nothing;
end
$$;
create or replace function private.gm_notify_like()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare recipient uuid;
begin
 select user_id into recipient from public.posts where id=new.post_id;
 perform private.gm_push_notification(recipient,new.user_id,'like',
   coalesce(private.gm_notification_actor(new.user_id),'Pengguna GastronoMap')||' menyukai postingan Anda',
   'Ada suka baru pada cerita kuliner Anda',new.post_id,null,null,null,'like:'||new.post_id||':'||new.user_id);
 return new;
end
$$;
drop trigger if exists gm_notify_like on public.post_likes;
create trigger gm_notify_like after insert on public.post_likes for each row execute function private.gm_notify_like();

create or replace function private.gm_notify_comment()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare post_owner uuid; parent_owner uuid; actor_name text;
begin
 select user_id into post_owner from public.posts where id=new.post_id;
 actor_name := coalesce(private.gm_notification_actor(new.user_id),'Pengguna GastronoMap');
 if new.parent_id is not null then
   select user_id into parent_owner from public.comments where id=new.parent_id;
   perform private.gm_push_notification(parent_owner,new.user_id,'reply',
     actor_name||' membalas komentar Anda',new.body,new.post_id,null,null,null,'reply:'||new.id);
 end if;
 if post_owner is distinct from parent_owner or new.parent_id is null then
   perform private.gm_push_notification(post_owner,new.user_id,'comment',
     actor_name||' berkomentar pada postingan Anda',new.body,new.post_id,null,null,null,'comment:'||new.id);
 end if;
 return new;
end
$$;
drop trigger if exists gm_notify_comment on public.comments;
create trigger gm_notify_comment after insert on public.comments for each row execute function private.gm_notify_comment();

create or replace function private.gm_notify_report()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if new.status is distinct from old.status and new.status <> 'pending' then
   perform private.gm_push_notification(new.user_id,null,'report',
     'Status laporan: '||new.status,'Laporan Anda telah diperbarui',null,new.resto_id,new.id);
 end if;
 return new;
end
$$;
drop trigger if exists gm_notify_report on public.reports;
create trigger gm_notify_report after update of status on public.reports for each row execute function private.gm_notify_report();

create or replace function private.gm_notify_link()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if new.status is distinct from old.status and new.status <> 'pending' then
   perform private.gm_push_notification(new.user_id,null,'link',
     'Pengajuan link: '||new.status,'Pengajuan link restoran telah diperbarui',null,new.resto_id,null,new.id);
 end if;
 return new;
end
$$;
drop trigger if exists gm_notify_link on public.online_link_submissions;
create trigger gm_notify_link after update of status on public.online_link_submissions for each row execute function private.gm_notify_link();

create or replace function private.gm_notify_resto()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if tg_op='INSERT' then
   perform private.gm_push_notification(new.created_by,null,'resto_submitted',
     'Restoran berhasil ditambahkan',new.name,null,new.id,null,null,'resto_submitted:'||new.id);
 elsif new.is_verified is true and old.is_verified is distinct from true then
   perform private.gm_push_notification(new.created_by,null,'resto_verified',
     'Restoran telah diverifikasi',new.name,null,new.id);
 end if;
 return new;
end
$$;
drop trigger if exists gm_notify_resto on public.restos;
create trigger gm_notify_resto after insert or update of is_verified on public.restos for each row execute function private.gm_notify_resto();

create or replace function private.gm_notify_contribution()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if new.points > 0 then
   perform private.gm_push_notification(new.user_id,null,'contribution',
     'Poin kontribusi +'||new.points,coalesce(new.category,'Kontribusi GastronoMap'),null,new.resto_id,null,null,'contribution:'||new.id);
 end if;
 return new;
end
$$;
drop trigger if exists gm_notify_contribution on public.contribution_points;
create trigger gm_notify_contribution after insert on public.contribution_points for each row execute function private.gm_notify_contribution();

-- Keep privileged helpers inaccessible for direct API callers.
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;

-- Publish own notification changes for live counters in the logged-in client.
do $$
begin
 if not exists (
  select 1 from pg_publication_tables
  where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
 ) then
   alter publication supabase_realtime add table public.notifications;
 end if;
end $$;

-- Backfill existing interactions without duplicates; do not synthesize past status transitions.
insert into public.notifications(user_id,actor_id,kind,title,message,post_id,event_key,created_at)
select p.user_id, l.user_id, 'like',
 coalesce(pr.username,'Pengguna GastronoMap')||' menyukai postingan Anda',
 'Ada suka baru pada cerita kuliner Anda', l.post_id, 'like:'||l.post_id||':'||l.user_id, l.created_at
from public.post_likes l join public.posts p on p.id=l.post_id
left join public.profiles pr on pr.id=l.user_id
where p.user_id<>l.user_id
on conflict(event_key) do nothing;
insert into public.notifications(user_id,actor_id,kind,title,message,post_id,event_key,created_at)
select distinct on (recipient, c.id) recipient,c.user_id,
 case when recipient = parent.user_id then 'reply' else 'comment' end,
 coalesce(pr.username,'Pengguna GastronoMap')||
 case when recipient = parent.user_id then ' membalas komentar Anda' else ' berkomentar pada postingan Anda' end,
 left(c.body,500), c.post_id, 
 case when recipient = parent.user_id then 'reply:' else 'comment:' end||c.id,c.created_at
from public.comments c
join public.posts p on p.id=c.post_id
left join public.comments parent on parent.id=c.parent_id
left join public.profiles pr on pr.id=c.user_id
cross join lateral (values (p.user_id),(parent.user_id)) recipients(recipient)
where recipient is not null and recipient<>c.user_id
on conflict(event_key) do nothing;
