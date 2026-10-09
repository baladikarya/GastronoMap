-- Unified review composer allows a user to keep their rating while
-- removing only the optional written testimonial.

begin;

drop policy if exists "testimonials: hapus milik sendiri"
  on public.testimonials;

create policy "testimonials: hapus milik sendiri"
on public.testimonials
for delete
to authenticated
using (auth.uid() = user_id);

commit;
