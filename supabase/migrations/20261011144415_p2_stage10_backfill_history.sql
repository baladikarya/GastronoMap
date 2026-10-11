-- Import historical system activity as read to avoid unread badge floods.
insert into public.notifications(user_id,kind,title,message,report_id,resto_id,created_at,read_at,event_key)
select r.user_id,'report','Status laporan: '||r.status,'Laporan Anda telah diperbarui',
 r.id,r.resto_id,coalesce(r.updated_at,r.created_at),now(),'history:report:'||r.id
from public.reports r
where r.user_id is not null and r.status<>'pending'
and not exists(select 1 from public.notifications n where n.report_id=r.id and n.kind='report')
on conflict(event_key) do nothing;

insert into public.notifications(user_id,kind,title,message,link_submission_id,resto_id,created_at,read_at,event_key)
select l.user_id,'link','Pengajuan link: '||l.status,'Pengajuan link restoran telah diperbarui',
 l.id,l.resto_id,coalesce(l.reviewed_at,l.created_at),now(),'history:link:'||l.id
from public.online_link_submissions l
where l.user_id is not null and l.status<>'pending'
and not exists(select 1 from public.notifications n where n.link_submission_id=l.id and n.kind='link')
on conflict(event_key) do nothing;

insert into public.notifications(user_id,kind,title,message,resto_id,created_at,read_at,event_key)
select r.created_by,'resto_submitted','Restoran berhasil ditambahkan',r.name,
 r.id,r.created_at,now(),'resto_submitted:'||r.id
from public.restos r where r.created_by is not null
on conflict(event_key) do nothing;

insert into public.notifications(user_id,kind,title,message,resto_id,created_at,read_at,event_key)
select r.created_by,'resto_verified','Restoran telah diverifikasi',r.name,
 r.id,coalesce(r.updated_at,r.created_at),now(),'history:verified:'||r.id
from public.restos r
where r.is_verified and r.created_by is not null
and not exists(select 1 from public.notifications n where n.resto_id=r.id and n.kind='resto_verified')
on conflict(event_key) do nothing;

insert into public.notifications(user_id,kind,title,message,resto_id,created_at,read_at,event_key)
select c.user_id,'contribution','Poin kontribusi +'||c.points,c.category,
 c.resto_id,c.created_at,now(),'contribution:'||c.id
from public.contribution_points c
where c.user_id is not null and c.points>0 and c.reversed_at is null
on conflict(event_key) do nothing;
