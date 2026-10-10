/* P1 Tahap 6 — Community feed, integrated with existing primary navigation. */
(()=>{
  'use strict';
  const view=document.getElementById('communityView');
  const body=view?.querySelector('.primary-view__body');
  if(!body) return;
  const feed=document.createElement('div');
  feed.id='communityFeed';
  feed.className='community-feed';
  body.replaceChildren(feed);
  const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const fmt=new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric'});
  let requestId=0;
  function status(message,retry=false){
    const wrap=node('div','community-feed-state',message);
    if(retry){const btn=node('button','community-feed-retry','Coba lagi');btn.type='button';btn.onclick=loadCommunityFeed;wrap.append(btn);}
    feed.replaceChildren(wrap);
  }
  function safeImage(url,cls,alt){
    if(typeof url!=='string'||!/^https:\/\//i.test(url))return null;
    const img=node('img',cls);img.src=url;img.alt=alt;img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';return img;
  }
  function renderPost(post,profiles,restos,media,likes,comments){
    const card=node('article','community-post');
    const header=node('div','community-post-header');
    const profile=profiles.get(post.user_id);
    const avatar=safeImage(profile?.avatar_url,'community-post-avatar','Foto profil');
    if(avatar)header.append(avatar);else header.append(node('span','community-post-avatar community-post-avatar--fallback',(profile?.username||'P').slice(0,1).toUpperCase()));
    const identity=node('div','community-post-identity');
    identity.append(node('strong','',profile?.username||'Pengguna GastronoMap'));
    identity.append(node('time','community-post-time',fmt.format(new Date(post.created_at))));
    header.append(identity);card.append(header);
    if(post.caption)card.append(node('p','community-post-caption',post.caption));
    const photos=media.get(post.id)||[];
    if(photos.length){
      const gallery=node('div','community-post-gallery');
      for(const photo of photos){const img=safeImage(photo.url,'community-post-photo','Foto pengalaman kuliner');if(img)gallery.append(img);}
      if(gallery.childElementCount)card.append(gallery);
    }
    if(post.resto_id&&restos.has(post.resto_id)){
      const tag=node('button','community-post-resto','Lihat resto · '+restos.get(post.resto_id));
      tag.type='button';
      tag.onclick=()=>{navigatePrimaryView('home');openDetail(post.resto_id);};
      card.append(tag);
    }
    if(post.location_name)card.append(node('div','community-post-location','Lokasi: '+post.location_name));
    const actions=node('div','community-post-actions');
    actions.append(node('span','','Suka · '+(likes.get(post.id)||0)));
    actions.append(node('span','','Komentar · '+(comments.get(post.id)||0)));
    actions.append(node('span','','Bagikan'));
    actions.setAttribute('aria-label','Interaksi posting akan tersedia pada tahap berikutnya');
    card.append(actions);
    return card;
  }
  async function loadCommunityFeed(){
    const current=++requestId;
    status('Memuat cerita komunitas…');
    try{
      const {data:posts,error}=await sb.from('posts').select('id,user_id,resto_id,caption,location_name,created_at').order('created_at',{ascending:false}).limit(20);
      if(error)throw error;
      if(current!==requestId)return;
      if(!posts?.length){status('Belum ada postingan Community. Cerita kuliner pertama akan tampil di sini.');return;}
      const ids=posts.map(p=>p.id);
      const userIds=[...new Set(posts.map(p=>p.user_id))];
      const restoIds=[...new Set(posts.map(p=>p.resto_id).filter(Boolean))];
      const requests=[
        sb.from('post_media').select('post_id,url,position').in('post_id',ids).order('position'),
        sb.from('post_likes').select('post_id').in('post_id',ids),
        sb.from('comments').select('post_id').in('post_id',ids),
        sb.from('profiles').select('id,username,avatar_url').in('id',userIds)
      ];
      if(restoIds.length)requests.push(sb.from('restos').select('id,name').in('id',restoIds));
      const results=await Promise.all(requests);
      if(current!==requestId)return;
      for(const result of results){if(result.error)throw result.error;}
      const media=new Map(),likes=new Map(),comments=new Map();
      for(const item of results[0].data||[]){if(!media.has(item.post_id))media.set(item.post_id,[]);media.get(item.post_id).push(item);}
      for(const item of results[1].data||[])likes.set(item.post_id,(likes.get(item.post_id)||0)+1);
      for(const item of results[2].data||[])comments.set(item.post_id,(comments.get(item.post_id)||0)+1);
      const profiles=new Map((results[3].data||[]).map(p=>[p.id,p]));
      const restos=new Map((results[4]?.data||[]).map(r=>[r.id,r.name]));
      feed.replaceChildren(...posts.map(p=>renderPost(p,profiles,restos,media,likes,comments)));
    }catch(error){if(current!==requestId)return;console.error('Community feed:',error);status('Feed Community belum dapat dimuat. Periksa koneksi lalu coba lagi.',true);}
  }
  document.getElementById('navCommunityBtn')?.addEventListener('click',loadCommunityFeed);
  window.addEventListener('popstate',()=>{if(history.state?.gmView==='community')loadCommunityFeed();});
  window.loadCommunityFeed=loadCommunityFeed;
})();
