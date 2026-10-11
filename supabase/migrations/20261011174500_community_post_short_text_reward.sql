create or replace function public.gm_reconcile_post_reward(p_post_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p record;
begin
 select id,user_id,resto_id,caption into p from public.posts where id=p_post_id;
 if not found then return; end if;
 if char_length(btrim(coalesce(p.caption,''))) >= 1
    or exists(select 1 from public.post_media where post_id=p.id) then
   perform public.gm_record_reward(p.user_id,p.resto_id,'community_post',3,'posts',p.id);
 else
   perform public.gm_reverse_reward('posts',p.id,'Postingan tidak berisi cerita atau foto');
 end if;
end;
$$;
insert into public.contribution_points(user_id,resto_id,category,points,created_at,source_kind,source_id)
select a.user_id,a.resto_id,'community_post',3,a.created_at,'posts',a.id
from public.posts a join public.profiles p on p.id=a.user_id
where p.role='user' and (char_length(btrim(coalesce(a.caption,'')))>=1 or
exists(select 1 from public.post_media m where m.post_id=a.id))
on conflict (source_kind,source_id) where source_kind is not null and source_id is not null do nothing;