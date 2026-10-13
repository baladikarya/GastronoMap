-- P2 Stage 12 follow-up: keep privileged helpers out of the exposed API
-- and apply suspension consistently to restaurant contributions.
begin;
create schema if not exists gm_private;
revoke all on schema gm_private from public;
grant usage on schema gm_private to anon, authenticated;

create or replace function gm_private.is_suspended_now(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
  select 1 from public.profiles p
  where p.id=p_user_id and p.suspended_at is not null
    and (p.suspended_until is null or p.suspended_until>now())
 );
$$;
revoke all on function gm_private.is_suspended_now(uuid) from public,anon,authenticated;
grant execute on function gm_private.is_suspended_now(uuid) to anon,authenticated;

create or replace function gm_private.is_moderator()
returns boolean language sql stable security definer set search_path=''
as $$ select auth.uid() is not null and public.is_admin(auth.uid()); $$;
revoke all on function gm_private.is_moderator() from public,anon,authenticated;
grant execute on function gm_private.is_moderator() to anon,authenticated;

-- Public wrappers are SECURITY INVOKER and only delegate to the internal schema.
create or replace function public.is_suspended_now(p_user_id uuid)
returns boolean language sql stable security invoker set search_path=''
as $$ select gm_private.is_suspended_now(p_user_id); $$;
create or replace function public.gm_moderator()
returns boolean language sql stable security invoker set search_path=''
as $$ select gm_private.is_moderator(); $$;

-- Suspend cannot be bypassed by submitting a restaurant/review contribution
-- using direct REST requests. RLS ownership remains the primary authorization.
create or replace function public.gm_contribution_guard()
returns trigger language plpgsql security definer set search_path=''
as $$
declare contributor uuid;
begin
  if auth.uid() is null then raise exception 'Login diperlukan'; end if;
  if tg_table_name='restos' then contributor:=new.created_by;
  else contributor:=new.user_id; end if;
  if contributor is distinct from auth.uid() and not public.is_admin(auth.uid()) then
    raise exception 'Pengguna kontribusi tidak sesuai';
  end if;
  if gm_private.is_suspended_now(auth.uid()) and not public.is_admin(auth.uid()) then
    raise exception 'Akun sementara dibatasi dari kontribusi';
  end if;
  return new;
end;
$$;
revoke all on function public.gm_contribution_guard() from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array['restos','ratings','testimonials','favorite_menu',
                            'references_link','online_link_submissions'] loop
    execute format('drop trigger if exists gm_contribution_guard_trg on public.%I',t);
    execute format('create trigger gm_contribution_guard_trg before insert or update on public.%I for each row execute function public.gm_contribution_guard()',t);
  end loop;
end $$;
-- Community edit operations should also be unavailable while an account is suspended.
drop trigger if exists gm_posts_update_guard_trg on public.posts;
create trigger gm_posts_update_guard_trg before update on public.posts
  for each row execute function public.gm_contribution_guard();
drop trigger if exists gm_comments_update_guard_trg on public.comments;
create trigger gm_comments_update_guard_trg before update on public.comments
  for each row execute function public.gm_contribution_guard();
commit;
