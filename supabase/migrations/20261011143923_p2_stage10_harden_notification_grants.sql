-- Enforce column-scoped Data API grants. RLS alone does not protect event immutability.
revoke all on table public.notifications from public, anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
revoke all on table public.notification_preferences from public, anon, authenticated;
grant select, insert, update on table public.notification_preferences to authenticated;