-- P1 / Tahap 4: canonical menu entities + food-photo tagging foundation
-- Backward-compatible with the current favorite_menu.menu_name and visit_photos model.

begin;

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

commit;
