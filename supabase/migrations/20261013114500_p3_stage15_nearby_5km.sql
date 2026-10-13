-- P3 Stage 15 refinement: limit Nearby Community posts to 5 km.
-- Replaces the existing function in place; preserves RLS/security invoker and posts.
begin;
create or replace function public.gm_community_discover(
  p_mode text default 'latest',
  p_area text default null,
  p_topic text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_limit integer default 13,
  p_offset integer default 0
)
returns table (
  id uuid, user_id uuid, resto_id uuid, caption text,
  location_name text, created_at timestamptz,
  moderation_state text, topic text, distance_km double precision
)
language sql stable security invoker set search_path = ''
as $$
  with scored as (
    select p.id, p.user_id, p.resto_id, p.caption, p.location_name,
           p.created_at, p.moderation_state, p.topic,
           case when p_lat between -90 and 90 and p_lng between -180 and 180
                   and r.lat between -90 and 90 and r.lng between -180 and 180
             then 6371.0088 * acos(least(1.0, greatest(-1.0,
               sin(radians(p_lat))*sin(radians(r.lat)) +
               cos(radians(p_lat))*cos(radians(r.lat))*cos(radians(r.lng-p_lng))
             )))
             else null end as distance_km,
           case when p_mode='popular'
             then (select count(*) from public.post_likes l where l.post_id=p.id) * 2
                + (select count(*) from public.comments c where c.post_id=p.id) * 3
             else 0 end as engagement
    from public.posts p
    left join public.restos r on r.id=p.resto_id
    where p_mode in ('latest','following','popular','nearby')
      and (p_topic is null or p_topic='' or p.topic=p_topic)
      and (p_area is null or btrim(p_area)='' or
        position(lower(btrim(p_area)) in lower(
          coalesce(p.location_name,'') || ' ' || coalesce(r.address,'')
        )) > 0)
      and (p_mode<>'following' or exists (
        select 1 from public.user_follows f
        where f.follower_id=(select auth.uid()) and f.following_id=p.user_id
      ))
      and (p_mode<>'popular' or p.created_at >= now()-interval '30 days')
      and (p_mode<>'nearby' or (p_lat between -90 and 90 and p_lng between -180 and 180))
  )
  select s.id,s.user_id,s.resto_id,s.caption,s.location_name,
         s.created_at,s.moderation_state,s.topic,s.distance_km
  from scored s
  where (p_mode<>'nearby' or s.distance_km <= 5)
  order by
    case when p_mode='popular' then s.engagement end desc nulls last,
    case when p_mode='nearby' then s.distance_km end asc nulls last,
    s.created_at desc, s.id desc
  limit least(greatest(coalesce(p_limit,13),1),24)
  offset least(greatest(coalesce(p_offset,0),0),100000);
$$;
revoke all on function public.gm_community_discover(text,text,text,double precision,double precision,integer,integer) from public;
grant execute on function public.gm_community_discover(text,text,text,double precision,double precision,integer,integer) to anon,authenticated;

commit;
