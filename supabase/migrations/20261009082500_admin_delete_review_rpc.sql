-- Atomic admin moderation action for deleting one user's full review
-- (rating + optional testimonial) for a restaurant.

begin;

create or replace function public.admin_delete_review(
  p_resto_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'Admin access required';
  end if;

  delete from public.testimonials
  where resto_id = p_resto_id
    and user_id = p_user_id;

  delete from public.ratings
  where resto_id = p_resto_id
    and user_id = p_user_id;
end;
$$;

revoke all on function public.admin_delete_review(uuid, uuid)
  from public, anon;
grant execute on function public.admin_delete_review(uuid, uuid)
  to authenticated;

commit;
