(()=>{'use strict';
const page=document.getElementById('gm-community'), feed=document.getElementById('gm-feed'), nav=document.getElementById('gm-bottom');
const el=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x};
function active(which){page.hidden=which!=='community';nav.querySelectorAll('[data-gm-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.gmTab===which);b.setAttribute('aria-current',b.dataset.gmTab===which?'page':'false')});document.getElementById('map').style.visibility=which==='community'?'hidden':''}
async function load(){feed.replaceChildren(el('div','gm-empty','Memuat cerita komunitas…'));try{
 const {data,error}=await sb.from('posts').select('id,user_id,caption,location_name,resto_id,created_at,post_media(url,position)').order('created_at',{ascending:false}).limit(20);
 if(error)throw error;
 if(!data?.length){feed.replaceChildren(el('div','gm-empty','Belum ada cerita kuliner. Jadilah yang pertama berbagi di Community!'));return}
 const ids=[...new Set(data.map(p=>p.user_id))],restoIds=[...new Set(data.map(p=>p.resto_id).filter(Boolean))];
 const [profiles,restos]=await Promise.all([sb.from('profiles').select('id,display_name').in('id',ids),restoIds.length?sb.from('restos').select('id,name').in('id',restoIds):Promise.resolve({data:[]})]);
 const users=new Map((profiles.data||[]).map(u=>[u.id,u.display_name])), places=new Map((restos.data||[]).map(r=>[r.id,r.name]));
 feed.replaceChildren();
 for(const p of data){const card=el('article','gm-post'),head=el('div','gm-post-head'),name=users.get(p.user_id)||'Pecinta Kuliner',av=el('div','gm-avatar',name.charAt(0).toUpperCase()),who=el('div');who.append(el('div','gm-post-name',name),el('div','gm-post-date',new Date(p.created_at).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})));head.append(av,who);card.append(head);
 if(p.caption)card.append(el('p','gm-post-caption',p.caption));
 for(const m of (p.post_media||[]).sort((a,b)=>a.position-b.position)){const img=el('img','gm-post-image');img.src=m.url;img.loading='lazy';img.alt='Foto pengalaman kuliner';card.append(img)}
 if(p.resto_id&&places.has(p.resto_id)){const btn=el('button','gm-post-resto','⌖ '+places.get(p.resto_id));btn.addEventListener('click',()=>{active('home');if(typeof openDetail==='function')openDetail(p.resto_id)});card.append(btn)}
 else if(p.location_name)card.append(el('div','gm-post-date','⌖ '+p.location_name));
 const actions=el('div','gm-post-actions');actions.append(el('span','','♡ Suka'),el('span','','◯ Komentar'),el('span','','↗ Bagikan'));card.append(actions);feed.append(card)}
 }catch(e){const box=el('div','gm-empty','Feed belum dapat dimuat. Pastikan migrasi Community sudah diterapkan.');const b=el('button','gm-retry','Coba lagi');b.onclick=load;box.append(el('div','',' '),b);feed.replaceChildren(box);console.warn('Community:',e)}}
nav.addEventListener('click',e=>{const b=e.target.closest('[data-gm-tab]');if(!b)return;const t=b.dataset.gmTab;if(t==='community'){active(t);load()}else if(t==='home'){active(t)}else if(t==='add'){active('home');document.getElementById('fab')?.click()}else if(t==='leaderboard'){active('home');document.getElementById('openLeaderboardBtn')?.click()}else if(t==='more'){active('home');document.getElementById('openWishlistBtn')?.click()}});
window.addEventListener('popstate',()=>active('home'));
active('home');
})();