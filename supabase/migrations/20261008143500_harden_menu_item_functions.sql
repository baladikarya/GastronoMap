-- Harden functions and indexes introduced by menu_items/photo-tag foundation.

begin;

alter function public.normalize_menu_item_name(text)
  set search_path = pg_catalog, public;

revoke all on function public.normalize_menu_item_name(text) from public, anon, authenticated;
revoke all on function public.link_favorite_menu_item() from public, anon, authenticated;
revoke all on function public.validate_food_photo_menu_tag() from public, anon, authenticated;

create index if not exists menu_items_created_by_idx
  on public.menu_items (created_by);

create index if not exists food_photo_menu_tags_tagged_by_idx
  on public.food_photo_menu_tags (tagged_by);

commit;
