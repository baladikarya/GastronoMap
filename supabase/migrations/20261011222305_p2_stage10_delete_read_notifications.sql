-- Read-only notification deletion; server enforces eligibility.
create policy "notifications_delete_read_own" on public.notifications
for delete to authenticated using ((select auth.uid()) = user_id and read_at is not null);
grant delete on public.notifications to authenticated;

-- Dismissal records prevent synthetic new-restaurant notices from reappearing.
create table if not exists public.dismissed_resto_notifications (
 user_id uuid not null references auth.users(id) on delete cascade,
 resto_id uuid not null references public.restos(id) on delete cascade,
 dismissed_at timestamptz not null default now(),
 primary key(user_id,resto_id)
);
alter table public.dismissed_resto_notifications enable row level security;
create policy "dismissed_resto_select_own" on public.dismissed_resto_notifications
 for select to authenticated using ((select auth.uid())=user_id);
create policy "dismissed_resto_insert_seen" on public.dismissed_resto_notifications
 for insert to authenticated with check (
 (select auth.uid())=user_id and exists(
 select 1 from public.seen_restos s where s.user_id=user_id and s.resto_id=resto_id
 ));
grant select,insert on public.dismissed_resto_notifications to authenticated;
revoke all on public.dismissed_resto_notifications from anon;