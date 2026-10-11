-- P0/P1: Secure a single contribution ledger and make rewards auditable.
-- Additive migration: historical rows are retained, including unattributed entries.
alter table public.contribution_points
  add column if not exists source_kind text,
  add column if not exists source_id uuid,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_reason text;

alter table public.contribution_points
  drop constraint if exists contribution_points_category_check;
alter table public.contribution_points
  add constraint contribution_points_category_check check (
    category in ('add_resto','foto_kunjungan','foto_menu','link_referensi',
      'link_online','testimoni','rating','menu_rekomendasi','community_post')
  );

create unique index if not exists gm_reward_source_unique
  on public.contribution_points (source_kind, source_id)
  where source_kind is not null and source_id is not null;
create index if not exists gm_reward_user_date_idx
  on public.contribution_points (user_id, created_at desc)
  where reversed_at is null;
create unique index if not exists gm_favorite_menu_user_item_unique
  on public.favorite_menu (user_id, resto_id, menu_item_id)
  where user_id is not null and menu_item_id is not null;

-- No direct writes are allowed from browsers, even signed-in users.
revoke all on table public.contribution_points from public, anon, authenticated;
alter table public.contribution_points enable row level security;
drop policy if exists "contribution_points: publik bisa lihat" on public.contribution_points;
drop policy if exists gm_contribution_points_read_own on public.contribution_points;
create policy gm_contribution_points_read_own on public.contribution_points
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.contribution_points to authenticated;

-- Retire the duplicated legacy scoreboard table from the public API.
-- Rows remain preserved for audit; all live scores use contribution_points.
-- leaderboard_points is a legacy VIEW (not a table) in this deployment.
-- It must not be modified by the client; revoke direct API access instead.
revoke all on table public.leaderboard_points from public, anon, authenticated;

-- Source-linked rewards are created ONLY by owned database triggers/RPC.
create or replace function public.gm_record_reward(
  p_user_id uuid,p_resto_id uuid,p_category text,p_points integer,
  p_source_kind text,p_source_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_role text; v_expected integer;
begin
  if p_user_id is null or p_source_kind is null or p_source_id is null then return; end if;
  select role into v_role from public.profiles where id=p_user_id;
  if v_role is distinct from 'user' then return; end if;
  v_expected:=case p_category
    when 'add_resto' then 5
    when 'foto_kunjungan' then 4
    when 'foto_menu' then 3
    when 'link_referensi' then 3
    when 'link_online' then 2
    when 'testimoni' then 2
    when 'rating' then 1
    when 'menu_rekomendasi' then 2
    when 'community_post' then 3
    else null end;
  if v_expected is null or p_points <> v_expected then
    raise exception 'Invalid contribution reward category or amount';
  end if;
  insert into public.contribution_points
    (user_id,resto_id,category,points,source_kind,source_id)
  values(p_user_id,p_resto_id,p_category,p_points,p_source_kind,p_source_id)
  on conflict (source_kind,source_id)
    where source_kind is not null and source_id is not null
  do update set reversed_at=null,reversal_reason=null;
end;
$$;

create or replace function public.gm_reverse_reward(p_source_kind text,p_source_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_source_kind is null or p_source_id is null then return; end if;
  update public.contribution_points
     set reversed_at=now(),reversal_reason=left(coalesce(p_reason,'Kontribusi dibatalkan'),200)
   where source_kind=p_source_kind and source_id=p_source_id and reversed_at is null;
end;
$$;

-- Existing online-approval RPC calls award_points(p_user,...). Route that
-- legacy internal call into the protected ledger without changing its API.
create or replace function public.award_points(p_user_id uuid,p_resto_id uuid,p_category text,p_points integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_submission_id uuid;
begin
  if p_category <> 'link_online' or p_points <> 2 then
    raise exception 'Legacy award_points is no longer used for this category';
  end if;
  select s.id into v_submission_id from public.online_link_submissions s
   where s.user_id=p_user_id and s.resto_id=p_resto_id and s.status='approved'
   order by s.reviewed_at desc nulls last,s.created_at desc limit 1;
  if v_submission_id is null then raise exception 'Approved submission is required'; end if;
  perform public.gm_record_reward(p_user_id,p_resto_id,'link_online',2,
    'online_link_submissions',v_submission_id);
end;
$$;

create or replace function public.trg_resto_verified()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_verified is true and old.is_verified is distinct from true then
    perform public.gm_record_reward(new.created_by,new.id,'add_resto',5,'restos',new.id);
    -- Legacy verified contributor progress is awarded once per resto.
    if new.created_by is not null and not exists (
      select 1 from public.contribution_points c
       where c.source_kind='restos' and c.source_id=new.id and c.reversed_at is not null
    ) and not exists (
      select 1 from public.profiles p where p.id=new.created_by and p.role='admin'
    ) then
      -- The counter is managed by the legacy workflow for old restaurants.
      -- For new awards, recount verified restaurants to avoid double increments.
      update public.profiles p
        set resto_approved_count=(select count(*)::integer from public.restos r
            where r.created_by=new.created_by and r.is_verified)
        where p.id=new.created_by;
      update public.profiles p set is_verified_contributor=true
        where p.id=new.created_by and p.is_verified_contributor=false
          and (p.resto_approved_count>=3 or p.full_review_count>=5);
    end if;
  elsif new.is_verified is false and old.is_verified is true then
    perform public.gm_reverse_reward('restos',new.id,'Verifikasi restoran dicabut');
  end if;
  return new;
end;
$$;

create or replace function public.trg_rating_points()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.gm_record_reward(new.user_id,new.resto_id,'rating',1,
     'ratings',md5(new.user_id::text||':'||new.resto_id::text)::uuid);
  perform public.check_full_review(new.user_id,new.resto_id);
  return new;
end;
$$;
create or replace function public.trg_testimonial_points()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.gm_record_reward(new.user_id,new.resto_id,'testimoni',2,
     'testimonials',md5(new.user_id::text||':'||new.resto_id::text)::uuid);
  perform public.check_full_review(new.user_id,new.resto_id);
  return new;
end;
$$;
create or replace function public.trg_visit_photo_points()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.gm_record_reward(new.user_id,new.resto_id,'foto_kunjungan',4,
    'visit_photos',new.id);
  perform public.check_full_review(new.user_id,new.resto_id);
  return new;
end;
$$;
create or replace function public.trg_menu_photo_points()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.gm_record_reward(new.user_id,new.resto_id,'foto_menu',3,
    'menu_photos',new.id);
  return new;
end;
$$;
create or replace function public.trg_reference_link_points()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.restos set link_referensi_locked_by=new.user_id
   where id=new.resto_id and link_referensi_locked_by is null
   returning id into v_id;
  if v_id is not null then
    perform public.gm_record_reward(new.user_id,new.resto_id,'link_referensi',3,
      'references_link',new.id);
  end if;
  return new;
end;
$$;

create or replace function public.gm_reconcile_post_reward(p_post_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  select id,user_id,resto_id,caption into p from public.posts where id=p_post_id;
  if not found then return; end if;
  -- Text-only stories must be meaningful. Photo posts may have short captions.
  if char_length(btrim(coalesce(p.caption,'')))>=10 or
     exists(select 1 from public.post_media where post_id=p.id) then
    perform public.gm_record_reward(p.user_id,p.resto_id,'community_post',3,'posts',p.id);
  else
    perform public.gm_reverse_reward('posts',p.id,'Postingan tidak berisi cerita atau foto');
  end if;
end;
$$;
create or replace function public.gm_on_post_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='DELETE' then
    perform public.gm_reverse_reward('posts',old.id,'Postingan dihapus');
    return old;
  end if;
  perform public.gm_reconcile_post_reward(new.id);
  return new;
end;
$$;
create or replace function public.gm_on_post_media_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.gm_reconcile_post_reward(case when tg_op='DELETE' then old.post_id else new.post_id end);
  return coalesce(new,old);
end;
$$;

create or replace function public.gm_on_favorite_menu_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='DELETE' then
    perform public.gm_reverse_reward('favorite_menu',old.id,'Rekomendasi menu dihapus');
    return old;
  end if;
  perform public.gm_record_reward(new.user_id,new.resto_id,'menu_rekomendasi',2,
    'favorite_menu',new.id);
  return new;
end;
$$;

create or replace function public.gm_on_reward_source_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_kind text; v_key uuid;
begin
  v_kind=tg_table_name;
  if v_kind in ('ratings','testimonials') then
    v_key=md5(old.user_id::text||':'||old.resto_id::text)::uuid;
  else
    v_key=old.id;
  end if;
  perform public.gm_reverse_reward(v_kind,v_key,'Kontribusi dihapus');
  return old;
end;
$$;

drop trigger if exists gm_post_reward_insert on public.posts;
create trigger gm_post_reward_insert after insert or update of caption on public.posts
  for each row execute function public.gm_on_post_changed();
drop trigger if exists gm_post_reward_delete on public.posts;
create trigger gm_post_reward_delete before delete on public.posts
  for each row execute function public.gm_on_post_changed();
drop trigger if exists gm_post_media_reward on public.post_media;
create trigger gm_post_media_reward after insert or delete on public.post_media
  for each row execute function public.gm_on_post_media_changed();
drop trigger if exists gm_menu_reward_insert on public.favorite_menu;
create trigger gm_menu_reward_insert after insert on public.favorite_menu
  for each row execute function public.gm_on_favorite_menu_changed();
drop trigger if exists gm_menu_reward_delete on public.favorite_menu;
create trigger gm_menu_reward_delete before delete on public.favorite_menu
  for each row execute function public.gm_on_favorite_menu_changed();

do $$
declare tbl text;
begin
  foreach tbl in array array['ratings','testimonials','visit_photos','menu_photos','references_link'] loop
    execute format('drop trigger if exists gm_reverse_on_delete on public.%I',tbl);
    execute format('create trigger gm_reverse_on_delete before delete on public.%I for each row execute function public.gm_on_reward_source_deleted()',tbl);
  end loop;
end;
$$;

-- Attach unambiguous old rewards to their content for future reversals.
update public.contribution_points c
 set source_kind='restos',source_id=r.id
from public.restos r
where c.source_kind is null and c.category='add_resto'
  and c.user_id=r.created_by and c.resto_id=r.id
  and c.user_id is not null;
update public.contribution_points c
 set source_kind='ratings',source_id=md5(c.user_id::text||':'||c.resto_id::text)::uuid
from public.ratings r
where c.source_kind is null and c.category='rating'
  and c.user_id=r.user_id and c.resto_id=r.resto_id;
update public.contribution_points c
 set source_kind='testimonials',source_id=md5(c.user_id::text||':'||c.resto_id::text)::uuid
from public.testimonials t
where c.source_kind is null and c.category='testimoni'
  and c.user_id=t.user_id and c.resto_id=t.resto_id;

-- Existing favorite menus and eligible stories from non-admin accounts get
-- their newly introduced reward once. Existing admin stories remain 0 points.
insert into public.contribution_points
  (user_id,resto_id,category,points,created_at,source_kind,source_id)
select fm.user_id,fm.resto_id,'menu_rekomendasi',2,fm.created_at,
       'favorite_menu',fm.id
  from public.favorite_menu fm join public.profiles p on p.id=fm.user_id
 where p.role='user'
on conflict (source_kind,source_id)
  where source_kind is not null and source_id is not null do nothing;

insert into public.contribution_points
  (user_id,resto_id,category,points,created_at,source_kind,source_id)
select post.user_id,post.resto_id,'community_post',3,post.created_at,
       'posts',post.id
  from public.posts post join public.profiles p on p.id=post.user_id
 where p.role='user' and (
   char_length(btrim(post.caption))>=10 or
   exists(select 1 from public.post_media m where m.post_id=post.id)
 )
on conflict (source_kind,source_id)
  where source_kind is not null and source_id is not null do nothing;

-- Harden inherited resto insertion policy: users cannot forge verifier or owner.
drop policy if exists "restos: user login bisa tambah" on public.restos;
create policy "restos: user login bisa tambah" on public.restos
 for insert to authenticated with check (
   created_by=(select auth.uid()) and (
     public.is_admin((select auth.uid())) or (
       is_verified=false and not exists (
         select 1 from jsonb_array_elements(coalesce(online_platforms,'[]'::jsonb)) x
         where coalesce(x->>'url','')<>''
       )
     )
   )
 );

-- Only server-owned triggers can call award/reversal internals.
revoke execute on function public.gm_record_reward(uuid,uuid,text,integer,text,uuid) from public,anon,authenticated;
revoke execute on function public.gm_reverse_reward(text,uuid,text) from public,anon,authenticated;
revoke execute on function public.gm_reconcile_post_reward(uuid) from public,anon,authenticated;
revoke execute on function public.award_points(uuid,uuid,text,integer) from public,anon,authenticated;
revoke execute on function public.check_full_review(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.gm_on_post_changed() from public,anon,authenticated;
revoke execute on function public.gm_on_post_media_changed() from public,anon,authenticated;
revoke execute on function public.gm_on_favorite_menu_changed() from public,anon,authenticated;
revoke execute on function public.gm_on_reward_source_deleted() from public,anon,authenticated;
revoke execute on function public.trg_resto_verified() from public,anon,authenticated;
revoke execute on function public.trg_rating_points() from public,anon,authenticated;
revoke execute on function public.trg_testimonial_points() from public,anon,authenticated;
revoke execute on function public.trg_visit_photo_points() from public,anon,authenticated;
revoke execute on function public.trg_menu_photo_points() from public,anon,authenticated;
revoke execute on function public.trg_reference_link_points() from public,anon,authenticated;

-- One total for all four profile stats; one exact source for the points value.
create or replace function public.gm_my_profile_stats()
returns table(contributions bigint,points bigint,visited bigint,posts bigint,
              verified boolean,approved_count integer,full_reviews integer)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid;
begin
  uid=(select auth.uid());
  if uid is null then raise exception 'Login diperlukan'; end if;
  return query
  select
   (select count(*) from public.restos r where r.created_by=uid)
   +(select count(*) from public.ratings r where r.user_id=uid)
   +(select count(*) from public.testimonials t where t.user_id=uid)
   +(select count(*) from public.visit_photos v where v.user_id=uid)
   +(select count(*) from public.menu_photos m where m.user_id=uid)
   +(select count(*) from public.favorite_menu f where f.user_id=uid)
   +(select count(*) from public.references_link l where l.user_id=uid),
   case when p.role='admin' then 0::bigint else
     (select coalesce(sum(c.points),0)::bigint from public.contribution_points c
       where c.user_id=uid and c.reversed_at is null) end,
   (select count(*) from public.visited v where v.user_id=uid),
   (select count(*) from public.posts post where post.user_id=uid),
   coalesce(p.is_verified_contributor,false),coalesce(p.resto_approved_count,0),
   coalesce(p.full_review_count,0)
  from public.profiles p where p.id=uid;
end;
$$;

-- User domicile, not restaurant geography, determines the scoreboard's city.
-- Show only verified non-admin contributors, without exposing other profile fields.
create or replace function public.gm_leaderboard(p_period text default 'month')
returns table(user_id uuid,username text,city text,points bigint)
language plpgsql stable security definer set search_path = '' as $$
declare cutoff timestamptz;
begin
  if p_period not in ('month','year','all') then raise exception 'Periode tidak valid'; end if;
  cutoff:=case p_period
    when 'month' then date_trunc('month',now(),'Asia/Jakarta')
    when 'year' then date_trunc('year',now(),'Asia/Jakarta')
    else '-infinity'::timestamptz end;
  return query
   select p.id,
     coalesce(nullif(btrim(p.username),''),'Pengguna')::text,
     coalesce(nullif(initcap(regexp_replace(btrim(p.city),'\s+',' ','g')),''),'Domisili belum diisi')::text,
     sum(c.points)::bigint
   from public.contribution_points c
     join public.profiles p on p.id=c.user_id
   where c.reversed_at is null and c.created_at>=cutoff
     and p.role='user' and p.is_verified_contributor=true
   group by p.id,p.username,p.city
   order by 3,4 desc,2;
end;
$$;
revoke execute on function public.gm_my_profile_stats() from public,anon,authenticated;
grant execute on function public.gm_my_profile_stats() to authenticated;
revoke execute on function public.gm_leaderboard(text) from public,anon,authenticated;
grant execute on function public.gm_leaderboard(text) to anon,authenticated;

-- This migration intentionally does NOT alter/delete historical orphan records.
