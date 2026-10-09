-- Review moderation:
-- - ordinary users may insert/update only their own reviews, but cannot delete;
-- - admins may delete any review, but existing UPDATE policies still prevent editing other users;
-- - ratings gain updated_at so the UI can show an Edited date when rating values change.

begin;

alter table public.ratings
  add column if not exists updated_at timestamptz;

update public.ratings
set updated_at = created_at
where updated_at is null;

alter table public.ratings
  alter column updated_at set default now(),
  alter column updated_at set not null;

create or replace function public.touch_review_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := coalesce(new.created_at, now());
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists ratings_touch_updated_at on public.ratings;
create trigger ratings_touch_updated_at
before insert or update on public.ratings
for each row execute function public.touch_review_updated_at();

drop trigger if exists testimonials_touch_updated_at on public.testimonials;
create trigger testimonials_touch_updated_at
before insert or update on public.testimonials
for each row execute function public.touch_review_updated_at();

drop policy if exists "testimonials: hapus milik sendiri"
  on public.testimonials;
drop policy if exists "testimonials: admin hapus ulasan"
  on public.testimonials;
drop policy if exists "ratings: admin hapus ulasan"
  on public.ratings;

create policy "testimonials: admin hapus ulasan"
on public.testimonials
for delete
to authenticated
using (public.is_admin(auth.uid()));

create policy "ratings: admin hapus ulasan"
on public.ratings
for delete
to authenticated
using (public.is_admin(auth.uid()));

revoke all on function public.touch_review_updated_at() from public, anon, authenticated;

commit;
