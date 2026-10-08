-- ============================================================
-- GASTRONOMAP DATABASE SCHEMA — CANONICAL NON-DESTRUCTIVE BASELINE
-- ============================================================
-- This file mirrors the latest repository migration baseline.
-- For normal changes, apply files in supabase/migrations in filename order.
-- Unlike the legacy schema, this baseline DOES NOT drop application tables
-- and is intended to preserve existing data.
-- ============================================================

-- GastronoMap P0 foundation schema sync
-- Version: 2026-10-06
-- Strategy: additive/non-destructive. Existing application data is preserved.
-- This migration is the canonical database baseline for the current frontend.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user',
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists username text,
  add column if not exists gender text,
  add column if not exists age integer,
  add column if not exists avatar_url text,
  add column if not exists is_verified_contributor boolean not null default false,
  add column if not exists resto_approved_count integer not null default 0,
  add column if not exists full_review_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists profiles_username_idx
  on public.profiles (lower(username))
  where username is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check_p0'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check_p0 check (role in ('user','admin'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Restaurants and existing crowdsource data
-- ---------------------------------------------------------------------------
create table if not exists public.restos (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  type text not null,
  price_range text,
  hours_by_day jsonb,
  menu_images jsonb not null default '[]'::jsonb,
  online_platforms jsonb not null default '[]'::jsonb,
  lat double precision not null,
  lng double precision not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restos
  add column if not exists phone text,
  add column if not exists payment_methods jsonb not null default '[]'::jsonb,
  add column if not exists no_online_sales boolean not null default false,
  add column if not exists is_verified boolean not null default false,
  add column if not exists city_id uuid,
  add column if not exists gofood_locked_by uuid references auth.users(id),
  add column if not exists grabfood_locked_by uuid references auth.users(id),
  add column if not exists shopeefood_locked_by uuid references auth.users(id);

create table if not exists public.ratings (
  resto_id uuid references public.restos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  overall numeric(3,2) not null check (overall between 1 and 5),
  harga integer check (harga between 1 and 5),
  porsi integer check (porsi between 1 and 5),
  rasa integer check (rasa between 1 and 5),
  suasana integer check (suasana between 1 and 5),
  kebersihan integer check (kebersihan between 1 and 5),
  pelayanan integer check (pelayanan between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (resto_id,user_id)
);

alter table public.ratings add column if not exists kebersihan integer;
alter table public.ratings add column if not exists updated_at timestamptz not null default now();
alter table public.ratings drop constraint if exists ratings_overall_check;
alter table public.ratings alter column overall type numeric(3,2) using overall::numeric;
alter table public.ratings add constraint ratings_overall_check check (overall between 1 and 5);
alter table public.ratings drop constraint if exists ratings_kebersihan_check;
alter table public.ratings add constraint ratings_kebersihan_check check (kebersihan between 1 and 5);

create table if not exists public.testimonials (
  resto_id uuid references public.restos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (resto_id,user_id)
);

create table if not exists public.favorite_menu (
  id uuid primary key default gen_random_uuid(),
  resto_id uuid references public.restos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  menu_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.references_link (
  id uuid primary key default gen_random_uuid(),
  resto_id uuid references public.restos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  url text not null,
  platform text not null default 'other',
  created_at timestamptz not null default now()
);

create table if not exists public.visited (
  resto_id uuid references public.restos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resto_id,user_id)
);

create table if not exists public.wishlist (
  resto_id uuid references public.restos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resto_id,user_id)
);

create table if not exists public.seen_restos (
  resto_id uuid references public.restos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resto_id,user_id)
);

create table if not exists public.visit_photos (
  id uuid primary key default gen_random_uuid(),
  resto_id uuid references public.restos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_photos (
  id uuid primary key default gen_random_uuid(),
  resto_id uuid references public.restos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reports, online-link review, leaderboard
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  resto_id uuid references public.restos(id) on delete set null,
  type text not null default 'other',
  message text not null,
  status text not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.online_link_submissions (
  id uuid primary key default gen_random_uuid(),
  resto_id uuid not null references public.restos(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  platforms jsonb not null default '[]'::jsonb,
  no_online_sales boolean not null default false,
  status text not null default 'pending',
  admin_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.leaderboard_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  city_id uuid references public.cities(id) on delete set null,
  resto_id uuid references public.restos(id) on delete set null,
  points integer not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_points_period_idx on public.leaderboard_points (created_at desc);
create index if not exists leaderboard_points_city_idx on public.leaderboard_points (city_id,user_id);
create index if not exists reports_status_created_idx on public.reports (status,created_at desc);
create index if not exists online_link_submissions_status_created_idx on public.online_link_submissions (status,created_at desc);
create index if not exists restos_created_at_idx on public.restos (created_at desc);

-- Add FK after cities exists; tolerate databases that already use a different city model.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'restos_city_id_fkey_p0'
      and conrelid = 'public.restos'::regclass
  ) then
    alter table public.restos
      add constraint restos_city_id_fkey_p0
      foreign key (city_id) references public.cities(id) on delete set null not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Safe public profile projection
-- ---------------------------------------------------------------------------
drop view if exists public.public_contributor_profiles;
create view public.public_contributor_profiles as
select
  id,
  username,
  avatar_url,
  is_verified_contributor,
  resto_approved_count,
  full_review_count
from public.profiles;

grant select on public.public_contributor_profiles to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and role = 'admin'
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id,display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists restos_set_updated_at on public.restos;
create trigger restos_set_updated_at before update on public.restos
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at before update on public.reports
for each row execute function public.set_updated_at();

drop trigger if exists online_link_submissions_set_updated_at on public.online_link_submissions;
create trigger online_link_submissions_set_updated_at before update on public.online_link_submissions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Online link moderation RPC used by the frontend
-- ---------------------------------------------------------------------------
create or replace function public.approve_online_link_submission(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.online_link_submissions%rowtype;
  v_platforms jsonb;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;

  select * into v_submission
  from public.online_link_submissions
  where id = p_submission_id
  for update;

  if not found then raise exception 'submission not found'; end if;
  if v_submission.status <> 'pending' then raise exception 'submission already reviewed'; end if;

  if v_submission.no_online_sales then
    update public.restos
    set online_platforms = '[]'::jsonb,
        no_online_sales = true
    where id = v_submission.resto_id;
  else
    select coalesce(jsonb_agg(existing_item),'[]'::jsonb)
      into v_platforms
    from jsonb_array_elements(coalesce(
      (select online_platforms from public.restos where id = v_submission.resto_id),
      '[]'::jsonb
    )) existing_item
    where not exists (
      select 1
      from jsonb_array_elements(coalesce(v_submission.platforms,'[]'::jsonb)) new_item
      where lower(coalesce(new_item->>'platform','')) =
            lower(coalesce(existing_item->>'platform',''))
    );

    v_platforms := coalesce(v_platforms,'[]'::jsonb) || coalesce(v_submission.platforms,'[]'::jsonb);

    update public.restos
    set online_platforms = v_platforms,
        no_online_sales = false,
        gofood_locked_by = case
          when exists (select 1 from jsonb_array_elements(coalesce(v_submission.platforms,'[]'::jsonb)) x where lower(x->>'platform')='gofood')
            then coalesce(gofood_locked_by,v_submission.user_id)
          else gofood_locked_by end,
        grabfood_locked_by = case
          when exists (select 1 from jsonb_array_elements(coalesce(v_submission.platforms,'[]'::jsonb)) x where lower(x->>'platform')='grabfood')
            then coalesce(grabfood_locked_by,v_submission.user_id)
          else grabfood_locked_by end,
        shopeefood_locked_by = case
          when exists (select 1 from jsonb_array_elements(coalesce(v_submission.platforms,'[]'::jsonb)) x where lower(x->>'platform')='shopeefood')
            then coalesce(shopeefood_locked_by,v_submission.user_id)
          else shopeefood_locked_by end
    where id = v_submission.resto_id;
  end if;

  update public.online_link_submissions
  set status='approved',
      reviewed_by=auth.uid(),
      reviewed_at=now()
  where id=p_submission_id;
end;
$$;

create or replace function public.reject_online_link_submission(
  p_submission_id uuid,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;

  update public.online_link_submissions
  set status='rejected',
      admin_note=nullif(trim(coalesce(p_note,'')),''),
      reviewed_by=auth.uid(),
      reviewed_at=now()
  where id=p_submission_id
    and status='pending';

  if not found then
    raise exception 'submission not found or already reviewed';
  end if;
end;
$$;

revoke all on function public.approve_online_link_submission(uuid) from public;
revoke all on function public.reject_online_link_submission(uuid,text) from public;
grant execute on function public.approve_online_link_submission(uuid) to authenticated;
grant execute on function public.reject_online_link_submission(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: rebuild app policies from one canonical source.
-- ---------------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select schemaname,tablename,policyname
    from pg_policies
    where schemaname='public'
      and tablename = any(array[
        'profiles','restos','ratings','testimonials','favorite_menu','references_link',
        'visited','wishlist','seen_restos','visit_photos','menu_photos','reports',
        'online_link_submissions','cities','leaderboard_points'
      ])
  loop
    execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  end loop;
end $$;

alter table public.profiles enable row level security;
alter table public.restos enable row level security;
alter table public.ratings enable row level security;
alter table public.testimonials enable row level security;
alter table public.favorite_menu enable row level security;
alter table public.references_link enable row level security;
alter table public.visited enable row level security;
alter table public.wishlist enable row level security;
alter table public.seen_restos enable row level security;
alter table public.visit_photos enable row level security;
alter table public.menu_photos enable row level security;
alter table public.reports enable row level security;
alter table public.online_link_submissions enable row level security;
alter table public.cities enable row level security;
alter table public.leaderboard_points enable row level security;

create policy profiles_read_self_or_admin on public.profiles
for select to authenticated
using (id=auth.uid() or public.is_admin(auth.uid()));

create policy profiles_update_self on public.profiles
for update to authenticated
using (id=auth.uid())
with check (id=auth.uid());

create policy restos_public_read on public.restos for select to anon,authenticated using (true);
create policy restos_authenticated_insert on public.restos for insert to authenticated
with check (created_by=auth.uid());
create policy restos_admin_update on public.restos for update to authenticated
using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy restos_admin_delete on public.restos for delete to authenticated
using (public.is_admin(auth.uid()));

create policy ratings_public_read on public.ratings for select to anon,authenticated using (true);
create policy ratings_own_insert on public.ratings for insert to authenticated with check (user_id=auth.uid());
create policy ratings_own_update on public.ratings for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy ratings_own_delete on public.ratings for delete to authenticated using (user_id=auth.uid());

create policy testimonials_public_read on public.testimonials for select to anon,authenticated using (true);
create policy testimonials_own_insert on public.testimonials for insert to authenticated with check (user_id=auth.uid());
create policy testimonials_own_update on public.testimonials for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy testimonials_own_delete on public.testimonials for delete to authenticated using (user_id=auth.uid());

create policy favorite_menu_public_read on public.favorite_menu for select to anon,authenticated using (true);
create policy favorite_menu_own_insert on public.favorite_menu for insert to authenticated with check (user_id=auth.uid());
create policy favorite_menu_own_delete on public.favorite_menu for delete to authenticated using (user_id=auth.uid() or public.is_admin(auth.uid()));

create policy references_public_read on public.references_link for select to anon,authenticated using (true);
create policy references_own_insert on public.references_link for insert to authenticated with check (user_id=auth.uid());
create policy references_own_delete on public.references_link for delete to authenticated using (user_id=auth.uid() or public.is_admin(auth.uid()));

create policy visited_private on public.visited for all to authenticated
using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy wishlist_private on public.wishlist for all to authenticated
using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy seen_restos_private on public.seen_restos for all to authenticated
using (user_id=auth.uid()) with check (user_id=auth.uid());

create policy visit_photos_public_read on public.visit_photos for select to anon,authenticated using (true);
create policy visit_photos_own_insert on public.visit_photos for insert to authenticated with check (user_id=auth.uid());
create policy visit_photos_own_delete on public.visit_photos for delete to authenticated using (user_id=auth.uid() or public.is_admin(auth.uid()));

create policy menu_photos_public_read on public.menu_photos for select to anon,authenticated using (true);
create policy menu_photos_own_insert on public.menu_photos for insert to authenticated with check (user_id=auth.uid());
create policy menu_photos_own_delete on public.menu_photos for delete to authenticated using (user_id=auth.uid() or public.is_admin(auth.uid()));

create policy reports_own_insert on public.reports for insert to authenticated with check (user_id=auth.uid());
create policy reports_own_or_admin_read on public.reports for select to authenticated
using (user_id=auth.uid() or public.is_admin(auth.uid()));
create policy reports_admin_update on public.reports for update to authenticated
using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy online_links_own_insert on public.online_link_submissions for insert to authenticated
with check (user_id=auth.uid());
create policy online_links_own_or_admin_read on public.online_link_submissions for select to authenticated
using (user_id=auth.uid() or public.is_admin(auth.uid()));

create policy cities_public_read on public.cities for select to anon,authenticated using (true);
create policy leaderboard_public_read on public.leaderboard_points for select to anon,authenticated using (true);

-- Column-level protection for profile roles / verification fields.
revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name,username,gender,age,avatar_url) on public.profiles to authenticated;

grant select on public.restos,public.ratings,public.testimonials,public.favorite_menu,
  public.references_link,public.visit_photos,public.menu_photos,public.cities,
  public.leaderboard_points to anon,authenticated;

grant insert on public.restos,public.ratings,public.testimonials,public.favorite_menu,
  public.references_link,public.visit_photos,public.menu_photos,public.reports,
  public.online_link_submissions to authenticated;

grant select on public.visited,public.wishlist,public.seen_restos,public.reports,
  public.online_link_submissions to authenticated;

grant insert,update,delete on public.visited,public.wishlist,public.seen_restos to authenticated;
grant update,delete on public.restos,public.ratings,public.testimonials,public.reports to authenticated;
grant delete on public.favorite_menu,public.references_link,public.visit_photos,public.menu_photos to authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket used by visit photos, menu photos and avatars
-- ---------------------------------------------------------------------------
insert into storage.buckets (id,name,public)
values ('visit-photos','visit-photos',true)
on conflict (id) do update set public=excluded.public;

drop policy if exists "visit-photos bucket: publik bisa lihat" on storage.objects;
drop policy if exists "visit-photos bucket: user login bisa upload" on storage.objects;
drop policy if exists "visit-photos bucket: hapus milik sendiri/admin" on storage.objects;
drop policy if exists gm_visit_photos_public_read on storage.objects;
drop policy if exists gm_visit_photos_authenticated_insert on storage.objects;
drop policy if exists gm_visit_photos_owner_or_admin_delete on storage.objects;

create policy gm_visit_photos_public_read on storage.objects
for select to anon,authenticated
using (bucket_id='visit-photos');

create policy gm_visit_photos_authenticated_insert on storage.objects
for insert to authenticated
with check (bucket_id='visit-photos' and auth.uid() is not null);

create policy gm_visit_photos_owner_or_admin_delete on storage.objects
for delete to authenticated
using (bucket_id='visit-photos' and (owner=auth.uid() or public.is_admin(auth.uid())));

-- P1 / Tahap 4: canonical menu entities + food-photo tagging foundation
-- Backward-compatible with the current favorite_menu.menu_name and visit_photos model.

-- ---------------------------------------------------------------------------
-- Canonical menu item identity
-- ---------------------------------------------------------------------------
create or replace function public.normalize_menu_item_name(p_name text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(btrim(coalesce(p_name,'')), '\s+', ' ', 'g'));
$$;

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  resto_id uuid not null references public.restos(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  normalized_name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists menu_items_resto_normalized_uidx
  on public.menu_items (resto_id, normalized_name);
create index if not exists menu_items_resto_idx
  on public.menu_items (resto_id);

create or replace function public.sync_menu_item_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := regexp_replace(btrim(coalesce(new.name,'')), '\s+', ' ', 'g');
  if new.name = '' then
    raise exception 'menu name cannot be empty';
  end if;
  new.normalized_name := public.normalize_menu_item_name(new.name);
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_menu_item_fields on public.menu_items;
create trigger trg_sync_menu_item_fields
before insert or update of name,resto_id on public.menu_items
for each row execute function public.sync_menu_item_fields();

-- Seed menu_items from the recommendation names that already exist.
insert into public.menu_items (resto_id,name,normalized_name,created_by)
select distinct on (fm.resto_id, public.normalize_menu_item_name(fm.menu_name))
  fm.resto_id,
  regexp_replace(btrim(fm.menu_name), '\s+', ' ', 'g') as name,
  public.normalize_menu_item_name(fm.menu_name) as normalized_name,
  fm.user_id
from public.favorite_menu fm
where public.normalize_menu_item_name(fm.menu_name) <> ''
order by
  fm.resto_id,
  public.normalize_menu_item_name(fm.menu_name),
  fm.created_at asc
on conflict (resto_id,normalized_name) do nothing;

-- Keep the legacy text column for compatibility, but attach each recommendation
-- to the canonical menu item whenever possible.
alter table public.favorite_menu
  add column if not exists menu_item_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'favorite_menu_menu_item_id_fkey'
      and conrelid = 'public.favorite_menu'::regclass
  ) then
    alter table public.favorite_menu
      add constraint favorite_menu_menu_item_id_fkey
      foreign key (menu_item_id)
      references public.menu_items(id)
      on delete set null;
  end if;
end $$;

create index if not exists favorite_menu_menu_item_idx
  on public.favorite_menu (menu_item_id);

update public.favorite_menu fm
set menu_item_id = mi.id
from public.menu_items mi
where fm.menu_item_id is null
  and fm.resto_id = mi.resto_id
  and public.normalize_menu_item_name(fm.menu_name) = mi.normalized_name;

-- Existing clients still insert only favorite_menu.menu_name. This trigger makes
-- those writes automatically create/reuse the canonical menu entity.
create or replace function public.link_favorite_menu_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_norm text;
  v_menu_item_id uuid;
begin
  v_name := regexp_replace(btrim(coalesce(new.menu_name,'')), '\s+', ' ', 'g');
  if v_name = '' then
    raise exception 'menu name cannot be empty';
  end if;

  v_norm := public.normalize_menu_item_name(v_name);

  insert into public.menu_items (resto_id,name,normalized_name,created_by)
  values (new.resto_id,v_name,v_norm,new.user_id)
  on conflict (resto_id,normalized_name)
  do update set normalized_name = excluded.normalized_name
  returning id into v_menu_item_id;

  new.menu_name := v_name;
  new.menu_item_id := v_menu_item_id;
  return new;
end;
$$;

revoke all on function public.link_favorite_menu_item() from public;

drop trigger if exists trg_link_favorite_menu_item on public.favorite_menu;
create trigger trg_link_favorite_menu_item
before insert or update of menu_name,resto_id on public.favorite_menu
for each row execute function public.link_favorite_menu_item();

-- ---------------------------------------------------------------------------
-- Many-to-many relation: one food photo can contain multiple menu items,
-- and one menu item can be represented by multiple food photos.
-- ---------------------------------------------------------------------------
create table if not exists public.food_photo_menu_tags (
  photo_id uuid not null references public.visit_photos(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  tagged_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id,menu_item_id)
);

create index if not exists food_photo_menu_tags_menu_item_idx
  on public.food_photo_menu_tags (menu_item_id);

create or replace function public.validate_food_photo_menu_tag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo_resto uuid;
  v_menu_resto uuid;
begin
  select resto_id into v_photo_resto
  from public.visit_photos
  where id = new.photo_id;

  if v_photo_resto is null then
    raise exception 'photo not found';
  end if;

  select resto_id into v_menu_resto
  from public.menu_items
  where id = new.menu_item_id;

  if v_menu_resto is null then
    raise exception 'menu item not found';
  end if;

  if v_photo_resto <> v_menu_resto then
    raise exception 'photo and menu item must belong to the same restaurant';
  end if;

  if new.tagged_by is null then
    new.tagged_by := auth.uid();
  end if;

  return new;
end;
$$;

revoke all on function public.validate_food_photo_menu_tag() from public;

drop trigger if exists trg_validate_food_photo_menu_tag on public.food_photo_menu_tags;
create trigger trg_validate_food_photo_menu_tag
before insert or update of photo_id,menu_item_id on public.food_photo_menu_tags
for each row execute function public.validate_food_photo_menu_tag();

-- ---------------------------------------------------------------------------
-- RLS / privileges
-- ---------------------------------------------------------------------------
alter table public.menu_items enable row level security;
alter table public.food_photo_menu_tags enable row level security;

drop policy if exists menu_items_public_read on public.menu_items;
drop policy if exists menu_items_authenticated_insert on public.menu_items;
drop policy if exists menu_items_admin_update on public.menu_items;
drop policy if exists menu_items_admin_delete on public.menu_items;

create policy menu_items_public_read on public.menu_items
for select to anon,authenticated
using (true);

create policy menu_items_authenticated_insert on public.menu_items
for insert to authenticated
with check (created_by=auth.uid());

create policy menu_items_admin_update on public.menu_items
for update to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy menu_items_admin_delete on public.menu_items
for delete to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists food_photo_menu_tags_public_read on public.food_photo_menu_tags;
drop policy if exists food_photo_menu_tags_own_insert on public.food_photo_menu_tags;
drop policy if exists food_photo_menu_tags_own_delete on public.food_photo_menu_tags;

create policy food_photo_menu_tags_public_read on public.food_photo_menu_tags
for select to anon,authenticated
using (true);

create policy food_photo_menu_tags_own_insert on public.food_photo_menu_tags
for insert to authenticated
with check (
  tagged_by=auth.uid()
  and exists (
    select 1
    from public.visit_photos vp
    where vp.id=photo_id
      and (vp.user_id=auth.uid() or public.is_admin(auth.uid()))
  )
);

create policy food_photo_menu_tags_own_delete on public.food_photo_menu_tags
for delete to authenticated
using (tagged_by=auth.uid() or public.is_admin(auth.uid()));

grant select on public.menu_items,public.food_photo_menu_tags to anon,authenticated;
grant insert on public.menu_items,public.food_photo_menu_tags to authenticated;
grant update,delete on public.menu_items to authenticated;
grant delete on public.food_photo_menu_tags to authenticated;

-- Harden functions and indexes introduced by menu_items/photo-tag foundation.

alter function public.normalize_menu_item_name(text)
  set search_path = pg_catalog, public;

revoke all on function public.normalize_menu_item_name(text) from public, anon, authenticated;
revoke all on function public.link_favorite_menu_item() from public, anon, authenticated;
revoke all on function public.validate_food_photo_menu_tag() from public, anon, authenticated;

create index if not exists menu_items_created_by_idx
  on public.menu_items (created_by);

create index if not exists food_photo_menu_tags_tagged_by_idx
  on public.food_photo_menu_tags (tagged_by);

-- Allow photo owners to edit food-photo menu tags
drop policy if exists food_photo_menu_tags_own_delete
  on public.food_photo_menu_tags;

create policy food_photo_menu_tags_own_delete
on public.food_photo_menu_tags
for delete
to authenticated
using (
  exists (
    select 1
    from public.visit_photos vp
    where vp.id = food_photo_menu_tags.photo_id
      and (
        vp.user_id = auth.uid()
        or public.is_admin(auth.uid())
      )
  )
);
