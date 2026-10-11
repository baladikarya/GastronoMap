-- Related authorization hardening: public cannot call administrative RPCs.
-- Authenticated administrators retain access; each RPC still checks auth.uid().
revoke execute on function public.approve_online_link_submission(uuid) from public,anon;
revoke execute on function public.reject_online_link_submission(uuid,text) from public,anon;
grant execute on function public.approve_online_link_submission(uuid) to authenticated;
grant execute on function public.reject_online_link_submission(uuid,text) to authenticated;

-- Invoked by an auth trigger, never directly by browser clients.
revoke execute on function public.handle_new_user() from public,anon,authenticated;

-- Stable, schema-qualified role check avoids mutable search_path.
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists(select 1 from public.profiles where id=uid and role='admin');
$$;
