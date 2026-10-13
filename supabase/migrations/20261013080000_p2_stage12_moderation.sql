-- P2 / Tahap 12: additive moderation and abuse controls.
-- Requires P0 foundation and Community migrations. Apply as a single transaction.
begin;

alter table public.reports
  add column if not exists target_type text not null default 'general',
  add column if not exists target_id uuid,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists resolved_at timestamptz;
update public.reports set target_type='resto', target_id=resto_id
  where resto_id is not null and target_type='general' and target_id is null;
create index if not exists reports_target_lookup_idx on public.reports(target_type,target_id,created_at desc);

alter table public.profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_until timestamptz,
  add column if not exists suspension_reason text,
  add column if not exists suspended_by uuid references auth.users(id) on delete set null;

alter table public.posts add column if not exists moderation_state text not null default 'visible';
alter table public.comments add column if not exists moderation_state text not null default 'visible';
alter table public.post_media add column if not exists moderation_state text not null default 'visible';
alter table public.visit_photos add column if not exists moderation_state text not null default 'visible';
alter table public.menu_photos add column if not exists moderation_state text not null default 'visible';

do $$
declare t text;
begin
  foreach t in array array['posts','comments','post_media','visit_photos','menu_photos'] loop
    if not exists (select 1 from pg_constraint where conrelid=('public.'||t)::regclass and conname=t||'_moderation_state_check') then
      execute format('alter table public.%I add constraint %I check (moderation_state in (''visible'',''hidden''))',t,t||'_moderation_state_check');
    end if;
  end loop;
end $$;

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  target_type text not null,
  target_id uuid not null,
  action text not null,
  reason text not null,
  report_id uuid references public.reports(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists moderation_actions_recent_idx on public.moderation_actions(created_at desc);
create index if not exists moderation_actions_target_idx on public.moderation_actions(target_type,target_id,created_at desc);
alter table public.moderation_actions enable row level security;
drop policy if exists moderation_actions_admin_read on public.moderation_actions;
create policy moderation_actions_admin_read on public.moderation_actions for select to authenticated
  using ((select public.gm_moderator()));
revoke all on public.moderation_actions from anon,authenticated;
grant select on public.moderation_actions to authenticated;

-- Helper runs with database privileges to prevent ordinary users from hiding bans
-- through RLS or profile edits. The caller never supplies their own actor identity.
create or replace function public.is_suspended_now(p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id=p_user_id and p.suspended_at is not null
      and (p.suspended_until is null or p.suspended_until > now())
  );
$$;
revoke all on function public.is_suspended_now(uuid) from public,anon;
grant execute on function public.is_suspended_now(uuid) to authenticated,anon;

-- RLS helper callable by visitors without exposing arbitrary role lookups.
create or replace function public.gm_moderator()
returns boolean language sql stable security definer set search_path = ''
as $$ select auth.uid() is not null and public.is_admin(auth.uid()); $$;
revoke all on function public.gm_moderator() from public,anon;
grant execute on function public.gm_moderator() to anon,authenticated;

-- Remove pre-existing permissive SELECT policies (OR-combined RLS policies
-- would otherwise continue to expose hidden posts and images).
do $$
declare p record;
begin
  for p in select tablename,policyname from pg_policies
    where schemaname='public' and tablename in ('posts','comments','post_media','visit_photos','menu_photos')
      and cmd in ('SELECT','ALL')
  loop
    execute format('drop policy if exists %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;

create policy gm_posts_moderated_read on public.posts for select to anon,authenticated
  using ((moderation_state='visible' and not public.is_suspended_now(user_id))
         or (select public.gm_moderator()));
create policy gm_comments_moderated_read on public.comments for select to anon,authenticated
  using (((moderation_state='visible' and not public.is_suspended_now(user_id))
          and exists (select 1 from public.posts p where p.id=post_id))
         or (select public.gm_moderator()));
create policy gm_media_moderated_read on public.post_media for select to anon,authenticated
  using (((moderation_state='visible') and exists (select 1 from public.posts p where p.id=post_id))
         or (select public.gm_moderator()));
create policy gm_visit_photos_moderated_read on public.visit_photos for select to anon,authenticated
  using (moderation_state='visible' or (select public.gm_moderator()));
create policy gm_menu_photos_moderated_read on public.menu_photos for select to anon,authenticated
  using (moderation_state='visible' or (select public.gm_moderator()));

-- Prevent a user from restoring moderation_state through a direct UPDATE API call.
-- Other columns required by current Community editing remain writable by owner RLS.
revoke update on public.posts, public.comments, public.post_media from authenticated;
grant update (caption,location_name,resto_id,updated_at) on public.posts to authenticated;
grant update (body,updated_at) on public.comments to authenticated;
grant update (position,url) on public.post_media to authenticated;

-- CHECK RLS policies for fresh contributions; existing ownership policies remain.
drop policy if exists "posts owned insert" on public.posts;
create policy "posts owned insert" on public.posts for insert to authenticated
  with check (user_id=(select auth.uid()) and moderation_state='visible'
    and not public.is_suspended_now((select auth.uid())));
drop policy if exists "comments self insert" on public.comments;
create policy "comments self insert" on public.comments for insert to authenticated
  with check (user_id=(select auth.uid()) and moderation_state='visible'
    and not public.is_suspended_now((select auth.uid()))
    and exists (select 1 from public.posts p where p.id=post_id)
    and (parent_id is null or exists(select 1 from public.comments c
       where c.id=parent_id and c.post_id=comments.post_id)));
drop policy if exists "media owner insert" on public.post_media;
create policy "media owner insert" on public.post_media for insert to authenticated
  with check (moderation_state='visible'
    and exists(select 1 from public.posts p
       where p.id=post_id and p.user_id=(select auth.uid())));
drop policy if exists "likes self insert" on public.post_likes;
create policy "likes self insert" on public.post_likes for insert to authenticated
  with check (user_id=(select auth.uid()) and not public.is_suspended_now((select auth.uid()))
    and exists(select 1 from public.posts p where p.id=post_id));
drop policy if exists "comment likes self insert" on public.comment_likes;
create policy "comment likes self insert" on public.comment_likes for insert to authenticated
  with check (user_id=(select auth.uid()) and not public.is_suspended_now((select auth.uid()))
    and exists(select 1 from public.comments c where c.id=comment_id));
drop policy if exists "saves self insert" on public.post_saves;
create policy "saves self insert" on public.post_saves for insert to authenticated
  with check (user_id=(select auth.uid()) and not public.is_suspended_now((select auth.uid()))
    and exists(select 1 from public.posts p where p.id=post_id));
drop policy if exists user_follows_insert_own on public.user_follows;
create policy user_follows_insert_own on public.user_follows for insert to authenticated
  with check (follower_id=(select auth.uid())
    and not public.is_suspended_now((select auth.uid())));
-- Prevent additional restaurant photo contributions while suspended.
do $$
declare p record;
begin
  for p in select tablename,policyname from pg_policies where schemaname='public'
    and tablename in ('visit_photos','menu_photos') and cmd='INSERT'
  loop
    execute format('drop policy if exists %I on public.%I',p.policyname,p.tablename);
  end loop;
end $$;
create policy gm_visit_photo_insert on public.visit_photos for insert to authenticated
  with check (user_id=(select auth.uid()) and not public.is_suspended_now((select auth.uid())));
create policy gm_menu_photo_insert on public.menu_photos for insert to authenticated
  with check (user_id=(select auth.uid()) and not public.is_suspended_now((select auth.uid())));

-- Validate reports and throttle repeated submissions server-side.
create or replace function public.gm_report_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare present boolean;
begin
  if new.user_id is distinct from auth.uid() or auth.uid() is null then
    raise exception 'Akun pelapor tidak valid';
  end if;
  -- Never trust client-supplied status, timestamps or moderation metadata.
  new.created_at := now();
  new.updated_at := now();
  new.status := 'pending';
  new.admin_note := null;
  new.resolved_by := null;
  new.resolved_at := null;
  new.message := trim(coalesce(new.message,''));
  if char_length(new.message) < 10 or char_length(new.message) > 2000 then
    raise exception 'Detail laporan harus 10 sampai 2000 karakter';
  end if;
  if new.target_type not in ('general','resto','post','comment','user','post_photo','visit_photo','menu_photo') then
    raise exception 'Jenis target laporan tidak didukung';
  end if;
  if new.target_type='general' and new.target_id is not null then
    raise exception 'Target laporan umum tidak valid';
  end if;
  if new.target_type not in ('general','resto') and new.target_id is null then
    raise exception 'Target laporan diperlukan';
  end if;
  if new.target_type='resto' then
    new.target_id := coalesce(new.target_id,new.resto_id);
    if new.target_id is null then raise exception 'Restoran tidak ditemukan'; end if;
    new.resto_id := new.target_id;
  end if;
  if new.target_type='user' and new.target_id=auth.uid() then
    raise exception 'Anda tidak dapat melaporkan akun sendiri';
  end if;
  if new.target_id is not null then
    case new.target_type
      when 'resto' then select exists(select 1 from public.restos where id=new.target_id) into present;
      when 'post' then select exists(select 1 from public.posts where id=new.target_id) into present;
      when 'comment' then select exists(select 1 from public.comments where id=new.target_id) into present;
      when 'user' then select exists(select 1 from public.profiles where id=new.target_id) into present;
      when 'post_photo' then select exists(select 1 from public.post_media where id=new.target_id) into present;
      when 'visit_photo' then select exists(select 1 from public.visit_photos where id=new.target_id) into present;
      when 'menu_photo' then select exists(select 1 from public.menu_photos where id=new.target_id) into present;
      else present := false;
    end case;
    if not coalesce(present,false) then raise exception 'Konten yang dilaporkan tidak tersedia'; end if;
  end if;
  if not public.is_admin(auth.uid()) then
    if exists(select 1 from public.reports r
      where r.user_id=auth.uid() and r.created_at>now()-interval '20 seconds') then
      raise exception 'Tunggu sebelum mengirim laporan berikutnya';
    end if;
    if (select count(*) from public.reports r
      where r.user_id=auth.uid() and r.created_at>now()-interval '24 hours') >= 12 then
      raise exception 'Batas laporan harian tercapai';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists gm_report_guard_trg on public.reports;
create trigger gm_report_guard_trg before insert on public.reports
  for each row execute function public.gm_report_guard();
revoke all on function public.gm_report_guard() from public,anon,authenticated;

-- Server-side per-account posting and comment limits; ordinary clients cannot
-- bypass these by disabling JavaScript or calling PostgREST directly.
create or replace function public.gm_community_rate_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare min_gap interval; window_max integer; total integer;
begin
  if new.user_id is distinct from auth.uid() or auth.uid() is null then
    raise exception 'Akun pengguna tidak valid';
  end if;
  new.created_at := now();
  new.updated_at := now();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || ':' || tg_table_name, 42));
  if public.is_suspended_now(auth.uid()) then
    raise exception 'Akun sementara dibatasi dari kontribusi';
  end if;
  if public.is_admin(auth.uid()) then return new; end if;
  if tg_table_name='posts' then
    min_gap := interval '15 seconds'; window_max := 6;
    select count(*) into total from public.posts where user_id=auth.uid()
      and created_at>now()-interval '1 hour';
    if total>=window_max or exists(select 1 from public.posts
      where user_id=auth.uid() and created_at>now()-min_gap) then
      raise exception 'Terlalu sering memposting. Coba beberapa saat lagi';
    end if;
  else
    min_gap := interval '3 seconds'; window_max := 40;
    select count(*) into total from public.comments where user_id=auth.uid()
      and created_at>now()-interval '1 hour';
    if total>=window_max or exists(select 1 from public.comments
      where user_id=auth.uid() and created_at>now()-min_gap) then
      raise exception 'Terlalu sering berkomentar. Coba beberapa saat lagi';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists gm_posts_rate_guard_trg on public.posts;
create trigger gm_posts_rate_guard_trg before insert on public.posts
  for each row execute function public.gm_community_rate_guard();
drop trigger if exists gm_comments_rate_guard_trg on public.comments;
create trigger gm_comments_rate_guard_trg before insert on public.comments
  for each row execute function public.gm_community_rate_guard();
revoke all on function public.gm_community_rate_guard() from public,anon,authenticated;

-- Admin-only moderation API; all state changes and audit writes are atomic.
create or replace function public.moderate_content(
  p_target_type text, p_target_id uuid, p_action text,
  p_reason text default '', p_report_id uuid default null, p_suspension_hours integer default null
) returns void language plpgsql security definer set search_path = ''
as $$
declare action_reason text; new_state text;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'Akses admin diperlukan';
  end if;
  action_reason := trim(coalesce(p_reason,''));
  if char_length(action_reason)<5 or char_length(action_reason)>1000 then
    raise exception 'Alasan tindakan minimal 5 karakter (maksimal 1000)';
  end if;
  if p_target_id is null or p_target_type not in
     ('post','comment','post_photo','visit_photo','menu_photo','user') then
    raise exception 'Target moderasi tidak valid';
  end if;
  if p_target_type='user' then
    if p_action not in ('suspend','unsuspend') then raise exception 'Aksi tidak valid'; end if;
    if p_target_id=auth.uid() or public.is_admin(p_target_id) then
      raise exception 'Akun admin tidak dapat dibatasi';
    end if;
    if p_action='suspend' then
      if p_suspension_hours is not null and (p_suspension_hours<1 or p_suspension_hours>8760) then
        raise exception 'Durasi suspend tidak valid';
      end if;
      update public.profiles set suspended_at=now(),
        suspended_until=case when p_suspension_hours is null then null
          else now()+make_interval(hours=>p_suspension_hours) end,
        suspension_reason=action_reason,suspended_by=auth.uid()
        where id=p_target_id;
    else
      update public.profiles set suspended_at=null,suspended_until=null,
        suspension_reason=null,suspended_by=null where id=p_target_id;
    end if;
  else
    if p_action not in ('hide','restore','delete') then raise exception 'Aksi tidak valid'; end if;
    new_state := case when p_action='hide' then 'hidden' else 'visible' end;
    case p_target_type
      when 'post' then
        if p_action='delete' then delete from public.posts where id=p_target_id;
        else update public.posts set moderation_state=new_state where id=p_target_id; end if;
      when 'comment' then
        if p_action='delete' then delete from public.comments where id=p_target_id;
        else update public.comments set moderation_state=new_state where id=p_target_id; end if;
      when 'post_photo' then
        if p_action='delete' then delete from public.post_media where id=p_target_id;
        else update public.post_media set moderation_state=new_state where id=p_target_id; end if;
      when 'visit_photo' then
        if p_action='delete' then delete from public.visit_photos where id=p_target_id;
        else update public.visit_photos set moderation_state=new_state where id=p_target_id; end if;
      when 'menu_photo' then
        if p_action='delete' then delete from public.menu_photos where id=p_target_id;
        else update public.menu_photos set moderation_state=new_state where id=p_target_id; end if;
    end case;
  end if;
  if not found then raise exception 'Target tidak ditemukan'; end if;
  insert into public.moderation_actions(actor_id,target_type,target_id,action,reason,report_id)
    values(auth.uid(),p_target_type,p_target_id,p_action,action_reason,p_report_id);
  if p_report_id is not null then
    update public.reports set status='resolved',resolved_by=auth.uid(),resolved_at=now()
      where id=p_report_id and target_type=p_target_type and target_id=p_target_id;
    if not found then raise exception 'Laporan tidak cocok dengan target'; end if;
  end if;
end;
$$;
revoke all on function public.moderate_content(text,uuid,text,text,uuid,integer) from public,anon;
grant execute on function public.moderate_content(text,uuid,text,text,uuid,integer) to authenticated;
commit;
