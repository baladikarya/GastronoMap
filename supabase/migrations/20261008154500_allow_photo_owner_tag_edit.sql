-- Allow the photo owner (or admin) to remove food-photo menu tags,
-- regardless of which authorized user originally created the tag relation.

begin;

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

commit;
