/* GastronoMap Profile — P1 Tahap 8. Views use existing authenticated Supabase data. */
(function(){
'use strict';
const root=document.getElementById('profileDashboard');
if(!root)return;
let page='main', savedTab='resto', contributionTab='Semua', notificationTab='Semua';
let ownPosts=[], ownContributions=[], savedPosts=[], savedRestos=[], visitedRestos=[], notifications=[];
let pointHistory=[];
let ticket=0;
let profileUser=null;
let notificationPrefs={interaction:true,system:true},notificationUnreadCount=0,notificationLimit=50,notificationHasMore=false;
let notificationChannel=null,notificationChannelUser=null,notificationRequest=0,badgeRequest=0;
let notificationSelectMode=false,notificationSelected=new Set(),notificationBusy=false;
const pageScroll=Object.create(null);
const backStack=[];
let pendingScroll=null;
const scrollContainer=()=>document.getElementById('accountOverlay');
function restorePosition(view,n){
 if(!pendingScroll || pendingScroll.view!==view || pendingScroll.token!==n)return;
 scrollContainer().scrollTop=pendingScroll.top;
 pendingScroll=null;
}
function openSubPage(next){
 if(next===page)return;
 backStack.push(page);
 setPage(next);
}
function backProfile(){
 setPage(backStack.pop()||'main',{restore:true});
}
const esc=(value)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eattr=esc;
const currentUser=()=>myUserId||null;
const resto=(id)=>allRestos[id]||null;
const date=(value)=>value?new Date(value).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}):'';
const tinyDate=(value)=>value?new Date(value).toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
const nameOf=(id)=>resto(id)?.name||'Restoran';
const safeImage=(raw)=>{
  if(!raw)return '';
  try{const url=new URL(raw,location.href);return ['https:','http:'].includes(url.protocol)?url.href:'';}catch(_){return '';}
};
const cover=(raw,klass='')=>{const url=safeImage(raw);return url?'<img class="'+klass+'" src="'+eattr(url)+'" alt="" loading="lazy">':'';};
const imageOf=(r)=>Array.isArray(r?.menuImages)?r.menuImages.find(x=>safeImage(x)):null;
const storageImage=(path)=>path?sb.storage.from('visit-photos').getPublicUrl(path).data.publicUrl:null;
const prefs=()=>notificationPrefs;
const rows=(res)=>{if(res.error)throw res.error;return res.data||[];};
function safeButton(text,action,extra=''){return '<button type="button" class="profile-action '+extra+'" data-action="'+action+'">'+text+'</button>';}
function heading(title,subtitle=''){
 return '<div class="profile-subheader"><button type="button" class="profile-back" aria-label="Kembali ke Profile" data-action="home"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><div><h2>'+esc(title)+'</h2>'+(subtitle?'<p>'+esc(subtitle)+'</p>':'')+'</div></div>';
}
function empty(message){return '<div class="profile-empty"><div class="profile-empty-symbol">✦</div><p>'+esc(message)+'</p></div>';}
function loading(){return '<div class="profile-loading" role="status">Memuat data...</div>';}
function notice(message){const box=root.querySelector('.profile-dynamic');if(box)box.innerHTML='<div class="profile-error">'+esc(message)+'</div>';restorePosition(page,ticket);}
function validStill(uid,n,view){return currentUser()===uid&&ticket===n&&page===view;}
function setPage(next,{restore=false}={}){
 const host=scrollContainer();
 // The outer Profile panel is the scroll container (not the dashboard div).
 if(root.innerHTML)pageScroll[page]=host.scrollTop;
 page=next;
 const n=++ticket;
 pendingScroll={view:next,token:n,top:restore?(pageScroll[next]||0):0};
 if(!currentUser()){renderGuest();restorePosition(next,n);return;}
 if(next==='main'){renderMain();restorePosition(next,n);return;}
 if(next==='notifications'){notificationLimit=50;notificationSelectMode=false;notificationSelected.clear();root.innerHTML=heading('Notifications','Aktivitas Community, kontribusi, dan restoran baru')+'<div class="profile-dynamic">'+loading()+'</div>';host.scrollTop=0;loadNotifications(n);return;}
 if(next==='saved'){root.innerHTML=heading('Saved','Restoran dan postingan yang disimpan')+'<div class="profile-dynamic">'+loading()+'</div>';host.scrollTop=0;loadSaved(n);return;}
 if(next==='visited'){root.innerHTML=heading('Visited','Restoran yang sudah Anda kunjungi')+'<div class="profile-dynamic">'+loading()+'</div>';host.scrollTop=0;loadVisited(n);return;}
 if(next==='posts'){root.innerHTML=heading('My Posts','Kelola cerita yang Anda bagikan di Community')+'<div class="profile-dynamic">'+loading()+'</div>';host.scrollTop=0;loadMyPosts(n);return;}
 if(next==='points'){root.innerHTML=heading('Riwayat Poin','Riwayat reward kontribusi Anda')+'<div class="profile-dynamic">'+loading()+'</div>';host.scrollTop=0;loadPoints(n);return;}
 if(next==='contributions'){root.innerHTML=heading('My Contributions','Riwayat kontribusi Anda di GastronoMap')+'<div class="profile-dynamic">'+loading()+'</div>';host.scrollTop=0;loadContributions(n);return;}
 if(next==='reports'){root.innerHTML=heading('Reports','Sampaikan masukan dan pantau laporan')+
   '<div class="profile-links">'+menuRow('Kirim Laporan','Sampaikan data restoran yang salah, bug, atau saran','sendReport','file-warning')+
   menuRow('Laporan Saya','Lihat progres penanganan laporan','myReports','clipboard-list')+'</div>';restorePosition(next,n);return;}
 if(next==='settings'){renderSettings();restorePosition(next,n);return;}
 if(next==='help'){root.innerHTML=heading('Help & Support','Panduan dan bantuan GastronoMap')+
  '<div class="profile-links">'+menuRow('Panduan Penggunaan','Cara menjelajah, berkontribusi, dan memakai fitur','usageGuide','book-open')+
  menuRow('Cara Install Aplikasi','Pasang GastronoMap di layar utama','installGuide','smartphone')+
  menuRow('Kirim Masukan','Laporkan kendala atau beri saran','sendReport','message-circle')+'</div>';restorePosition(next,n);return;}
 page='main';renderMain();restorePosition('main',n);
}
function menuRow(label,description,action,icon,count){
 const icons={bell:'bell',bookmark:'bookmark',check:'check-circle',posts:'posts',star:'star',report:'report',settings:'settings',help:'help',logout:'logout','file-warning':'report','clipboard-list':'posts','book-open':'guide',smartphone:'phone','message-circle':'message'};
 return '<button type="button" class="profile-menu-row" data-action="'+action+'"><span class="profile-menu-icon" aria-hidden="true"><svg class="profile-menu-svg" viewBox="0 0 24 24"><use href="assets/icons/ui.svg#'+(icons[icon]||'help')+'"></use></svg></span><span class="profile-menu-copy"><strong>'+esc(label)+'</strong><small>'+esc(description)+'</small></span>'+(count===undefined?'':'<span class="profile-menu-count">'+esc(count)+'</span>')+'<span class="profile-chevron" aria-hidden="true">›</span></button>';
}
function renderGuest(){
 root.innerHTML='<div class="profile-welcome"><div class="profile-welcome-icon">◉</div><h2>Selamat datang di Profile</h2><p>Login untuk melihat wishlist, kunjungan, postingan, poin, dan aktivitas Anda.</p>'+safeButton('Login / Register','login','profile-main-button')+'</div>';
}
function renderMain(){
 const label=esc(myUsername||'Pengguna GastronoMap'), initial=esc((myUsername||'G').slice(0,1).toUpperCase());
 const photo=safeImage(myAvatarUrl);
 const socials=[myInstagram?['Instagram','https://instagram.com/'+myInstagram.replace(/^@/,'')]:null,myTiktok?['TikTok','https://www.tiktok.com/@'+myTiktok.replace(/^@/,'')]:null,myWebsite?['Website',safeImage(myWebsite)]:null].filter(Boolean);
 const socialHtml=socials.length?'<div class="profile-socials">'+socials.map(([name,href])=>'<a href="'+eattr(href)+'" target="_blank" rel="noopener noreferrer">'+esc(name)+'</a>').join('')+'</div>':'';
 root.innerHTML='<div class="profile-cover"><div class="profile-cover-pattern"></div></div>'+
 '<div class="profile-identity"><button type="button" class="profile-avatar-button" data-action="avatar" aria-label="Ganti foto profil">'+
 (photo?cover(photo,'profile-avatar'):'<span class="profile-avatar-fallback">'+initial+'</span>')+
 '<span class="profile-avatar-camera">✎</span></button><h2>'+label+'</h2><p class="profile-handle">'+esc(myEmail||'')+'</p>'+
 ((typeof myCity!=='undefined'&&myCity)?'<p class="profile-location">⌖ '+esc(myCity)+'</p>':'')+
 ((typeof myBio!=='undefined'&&myBio)?'<p class="profile-bio">'+esc(myBio)+'</p>':'')+socialHtml+
 '<div id="profileVerifiedBadge" class="profile-verified hidden">✓ Verified Contributor</div></div>'+
 '<div class="profile-stat-row">'+
 stat('profileStatsContribution','Kontribusi','contributions')+stat('profileStatsPoints','Poin','points')+
 stat('profileStatsVisited','Dikunjungi','visited')+stat('profileStatsPosts','Postingan','posts')+'</div>'+
 (isAdmin?'<p class="profile-points-hint">Admin tetap berkontribusi, tetapi tidak mendapat poin dan tidak masuk Leaderboard.</p>':'<p id="profileContributorProgress" class="profile-points-hint hidden"></p>')+
 safeButton('✎  Edit Profile','edit','profile-edit-button')+
 '<div class="profile-links">'+
 menuRow('Notifications','Interaksi, kontribusi, verifikasi, dan restoran baru','notifications','bell',notificationUnreadCount)+
 menuRow('Saved','Wishlist restoran dan postingan tersimpan','saved','bookmark',wishlistIds.size)+
 menuRow('Visited','Restoran yang telah dikunjungi','visited','check',visitedIds.size)+
 menuRow('My Posts','Lihat dan kelola postingan Community','posts','posts','…')+
 menuRow('Profil Publik','Lihat profil sosial, followers, dan following','publicProfile','posts')+
 menuRow('My Contributions','Restoran, rating, ulasan, foto, dan menu','contributions','star')+
 menuRow('Reports','Laporan dan status penanganannya','reports','report')+
 menuRow('Settings','Preferensi notifikasi dan informasi akun','settings','settings')+
 menuRow('Help & Support','Panduan, instalasi, dan masukan','help','help')+
 menuRow('Logout','Keluar dari akun GastronoMap','logout','logout')+'</div>'+
 (isAdmin?'<div class="profile-admin"><h3>Admin</h3>'+
 menuRow('Kelola Laporan','Lihat laporan pengguna','adminReports','report')+
 menuRow('Kelola Link Online','Moderasi pengajuan link restoran','adminLinks','settings')+'</div>':'');
 loadStats(ticket);
}
function stat(id,label,action){return '<button type="button" class="profile-stat" data-action="'+action+'" aria-label="Lihat '+label+'"><strong id="'+id+'">–</strong><small>'+label+'</small></button>';}
async function loadStats(n){
 const uid=currentUser();
 try{
  const {data,error}=await sb.rpc('gm_my_profile_stats');
  if(error)throw error;
  if(!validStill(uid,n,'main'))return;
  const item=Array.isArray(data)?data[0]:data;
  if(!item)throw new Error('Statistik tidak tersedia');
  for(const [id,value] of [['profileStatsContribution',item.contributions],
   ['profileStatsPoints',item.points],['profileStatsVisited',item.visited],
   ['profileStatsPosts',item.posts]]){
   const element=document.getElementById(id);
   if(element)element.textContent=Number(value||0).toLocaleString('id-ID');
  }
  const badge=root.querySelector('[data-action="posts"] .profile-menu-count');
  if(badge)badge.textContent=Number(item.posts||0).toLocaleString('id-ID');
  document.getElementById('profileVerifiedBadge')?.classList.toggle('hidden',!item.verified);
  if(!isAdmin){
   const progress=root.querySelector('#profileContributorProgress');
   if(progress){
    progress.classList.toggle('hidden',!!item.verified);
    progress.textContent='Progres Verified Contributor: '+
      Math.min(Number(item.approved_count||0),3)+'/3 restoran terverifikasi atau '+
      Math.min(Number(item.full_reviews||0),5)+'/5 review lengkap';
   }
  }
 }catch(error){
  if(validStill(uid,n,'main'))console.error('Gagal memuat statistik Profile:',error);
 }
}
const pointCategory={
 add_resto:'Restoran terverifikasi',foto_kunjungan:'Foto kunjungan',
 foto_menu:'Foto menu',link_referensi:'Link referensi',
 link_online:'Link penjualan online',testimoni:'Ulasan restoran',
 rating:'Rating restoran',menu_rekomendasi:'Rekomendasi menu',
 community_post:'Postingan Community'
};
async function loadPoints(n){
 const uid=currentUser();
 if(isAdmin){
  root.querySelector('.profile-dynamic').innerHTML=empty(
   'Admin tidak mendapatkan poin dan tidak mengikuti Leaderboard. Semua aktivitas tetap ada di My Contributions dan My Posts.');
  restorePosition('points',n);return;
 }
 try{
  const [history,summary]=await Promise.all([
   sb.from('contribution_points').select('id,category,points,resto_id,created_at,reversed_at,source_kind,source_id')
     .eq('user_id',uid).order('created_at',{ascending:false}).limit(500),
   sb.rpc('gm_my_profile_stats')
  ]);
  if(history.error)throw history.error;
  if(summary.error)throw summary.error;
  if(!validStill(uid,n,'points'))return;
  const data=Array.isArray(summary.data)?summary.data[0]:summary.data;
  const items=history.data||[];
  pointHistory=items;
  const info='<div class="profile-reward-rules"><strong>Ketentuan poin</strong>'+
   '<span>Resto +5 · Foto kunjungan +4 · Foto menu +3 · Referensi +3 · Link online +2 · Ulasan +2 · Rating +1 · Rekomendasi menu +2 · Community Post +3</span>'+
   '<small>Setiap kontribusi valid mendapat reward satu kali. Jika konten dihapus, poin dibatalkan. Admin tidak mendapat poin.</small></div>';
  const list=items.map(entry=>{
   const undone=!!entry.reversed_at,post=entry.category==='community_post';
   const linked=entry.resto_id&&resto(entry.resto_id);
   const canOpen=!undone&&(post?!!entry.source_id:!!entry.resto_id);
   const action=canOpen?openCardButton('pointActivity',entry.id,'Lihat aktivitas '+(pointCategory[entry.category]||entry.category)):'';
   const detail=post?'Community':linked?nameOf(entry.resto_id):'GastronoMap';
   return '<article class="profile-points-entry'+(undone?' is-reversed':'')+'">'+action+'<div><strong>'+
    esc(pointCategory[entry.category]||entry.category)+'</strong><small>'+esc(detail)+' · '+
    esc(date(entry.created_at))+'</small>'+(undone?'<em>Reward dibatalkan</em>':'')+
    '</div><span class="profile-points-value">'+(undone?'0':'+'+Number(entry.points))+
    '</span></article>';
  }).join('');
  root.querySelector('.profile-dynamic').innerHTML=
   '<div class="profile-points-overview"><span>Total Poin</span><strong>'+
   Number(data?.points||0).toLocaleString('id-ID')+'</strong></div>'+info+
   '<div class="profile-section-meta">'+items.length+' transaksi terbaru'+(items.length>=500?' (500 teratas)':'')+'</div>'+
   (items.length?'<div class="profile-points-list">'+list+'</div>':empty('Belum ada poin.'));
  restorePosition('points',n);
 }catch(error){
  if(validStill(uid,n,'points'))notice('Riwayat poin gagal dimuat. '+error.message);
 }
}

// Full-card invisible button stays separate from Edit / trash for independent actions.
function openCardButton(action,id,label){
 return '<button type="button" class="profile-card-open" data-action="'+action+
  '" data-id="'+eattr(id)+'" aria-label="'+eattr(label)+'"></button>';
}
function trashButton(action,id,label){
 return '<button type="button" class="profile-trash-button" data-action="'+action+
  '" data-id="'+eattr(id)+'" aria-label="'+eattr(label)+'" title="'+eattr(label)+'">'+
  '<svg class="profile-trash-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="assets/icons/ui.svg#trash"></use></svg></button>';
}
function restoRow(r,action,extraLabel=''){
 const photo=imageOf(r), type=(r?.type||'Restoran');
 return '<article class="profile-resto-row">'+
 openCardButton('resto',r.id,'Lihat detail '+(r?.name||'restoran'))+
 '<div class="profile-resto-thumb">'+(photo?cover(photo):'<span>🍽</span>')+'</div>'+
 '<div class="profile-resto-copy"><strong>'+esc(r?.name||'Restoran')+'</strong><small>'+esc(r?.address||type)+'</small>'+
 (extraLabel?'<span>'+esc(extraLabel)+'</span>':'')+'</div>'+
 (action?trashButton(action,r.id,'Hapus restoran dari daftar'):'')+
 '</article>';
}
function postRow(p,kind){
 const first=p.media?.[0]?.url, id=eattr(p.id);
 return '<article class="profile-post-card">'+
 openCardButton('post',p.id,'Lihat detail postingan')+
 '<div class="profile-post-preview">'+(first?cover(first):'<div class="profile-post-noimage">CERITA KULINER</div>')+'</div>'+
 '<div class="profile-post-body"><small>'+esc(date(p.created_at))+
 (p.resto_id?' · '+esc(nameOf(p.resto_id)):'')+'</small>'+
 '<p>'+esc(p.caption||'Postingan tanpa caption')+'</p>'+
 (kind==='mine'?'<div class="profile-post-metrics">♡ '+esc(p.likes||0)+' · ◇ '+esc(p.comments||0)+'</div>':'')+
 '<div class="profile-post-buttons">'+
 (kind==='mine'?'<button type="button" class="profile-compact-btn" data-action="editPost" data-id="'+id+'">Edit</button>'+
  trashButton('deletePost',p.id,'Hapus postingan'):
  trashButton('removeSavedPost',p.id,'Hapus dari postingan tersimpan'))+
 '</div></div></article>';
}
async function loadMyPosts(n){
 const uid=currentUser();
 try{
  const posts=rows(await sb.from('posts').select('id,caption,location_name,resto_id,created_at,updated_at').eq('user_id',uid).order('created_at',{ascending:false}).limit(100));
  const ids=posts.map(p=>p.id);
  const [media,likes,comments]=ids.length?await Promise.all([
   sb.from('post_media').select('post_id,url,position').in('post_id',ids).order('position'),
   sb.from('post_likes').select('post_id').in('post_id',ids).limit(1000),
   sb.from('comments').select('post_id').in('post_id',ids).limit(1000)
  ]):[{data:[]},{data:[]},{data:[]}];
  rows(media);rows(likes);rows(comments);
  ownPosts=posts.map(p=>({...p,media:(media.data||[]).filter(m=>m.post_id===p.id),
   likes:(likes.data||[]).filter(x=>x.post_id===p.id).length,
   comments:(comments.data||[]).filter(x=>x.post_id===p.id).length}));
  if(!validStill(uid,n,'posts'))return;
  root.querySelector('.profile-dynamic').innerHTML='<div class="profile-section-meta">'+posts.length+' postingan terbaru</div>'+
  (ownPosts.length?'<div class="profile-post-grid">'+ownPosts.map(p=>postRow(p,'mine')).join('')+'</div>':empty('Belum ada postingan. Buat cerita baru dari halaman Community.'));
  restorePosition('posts',n);
 }catch(err){if(validStill(uid,n,'posts'))notice('Postingan gagal dimuat. '+err.message);}
}
function renderSavedContent(){
 if(page!=='saved')return;
 const target=root.querySelector('.profile-dynamic');
 target.innerHTML='<div class="profile-tabs"><button data-action="savedResto" class="'+(savedTab==='resto'?'selected':'')+'">Wishlist ('+savedRestos.length+')</button>'+
 '<button data-action="savedPosts" class="'+(savedTab==='posts'?'selected':'')+'">Post ('+savedPosts.length+')</button></div>'+
 (savedTab==='resto'?
  (savedRestos.length?'<div class="profile-resto-list">'+savedRestos.map(r=>restoRow(r,'removeWishlist')).join('')+'</div>':empty('Belum ada restoran tersimpan. Gunakan tombol Wishlist pada detail restoran.')):
  (savedPosts.length?'<div class="profile-post-grid">'+savedPosts.map(p=>postRow(p,'saved')).join('')+'</div>':empty('Belum ada postingan Community yang disimpan.')));
 restorePosition('saved',ticket);
}
async function loadSaved(n){
 const uid=currentUser();
 try{
  const [wish,saves]=await Promise.all([
   sb.from('wishlist').select('resto_id,created_at').eq('user_id',uid).order('created_at',{ascending:false}).limit(200),
   sb.from('post_saves').select('post_id,created_at').eq('user_id',uid).order('created_at',{ascending:false}).limit(100)
  ]);
  const wishRows=rows(wish),savedRows=rows(saves);
  wishlistIds=new Set(wishRows.map(v=>v.resto_id));
  savedRestos=wishRows.map(v=>resto(v.resto_id)).filter(Boolean);
  const ids=savedRows.map(v=>v.post_id);
  const [ps,media]=ids.length?await Promise.all([
   sb.from('posts').select('id,user_id,caption,resto_id,created_at').in('id',ids),
   sb.from('post_media').select('post_id,url,position').in('post_id',ids).order('position')
  ]):[{data:[]},{data:[]}];
  const postRows=rows(ps),images=rows(media);
  savedPosts=ids.map(id=>postRows.find(p=>p.id===id)).filter(Boolean).map(p=>({...p,media:images.filter(m=>m.post_id===p.id)}));
  if(validStill(uid,n,'saved'))renderSavedContent();
 }catch(err){if(validStill(uid,n,'saved'))notice('Daftar tersimpan gagal dimuat. '+err.message);}
}
async function loadVisited(n){
 const uid=currentUser();
 try{
  const data=rows(await sb.from('visited').select('resto_id,created_at').eq('user_id',uid).order('created_at',{ascending:false}).limit(200));
  visitedIds=new Set(data.map(x=>x.resto_id));
  visitedRestos=data.map(x=>({r:resto(x.resto_id),at:x.created_at})).filter(x=>x.r);
  if(validStill(uid,n,'visited')){
   root.querySelector('.profile-dynamic').innerHTML='<div class="profile-section-meta">'+data.length+' restoran dikunjungi</div>'+
    (visitedRestos.length?'<div class="profile-resto-list">'+visitedRestos.map(x=>restoRow(x.r,'removeVisited','Ditandai '+date(x.at))).join('')+'</div>':empty('Belum ada restoran yang ditandai telah dikunjungi.'));
   restorePosition('visited',n);
  }
 }catch(err){if(validStill(uid,n,'visited'))notice('Riwayat kunjungan gagal dimuat. '+err.message);}
}
const kinds={restos:'Resto',ratings:'Rating',testimonials:'Ulasan',visit_photos:'Foto',menu_photos:'Foto',favorite_menu:'Menu',references_link:'Referensi'};
function renderContributions(){
 const target=root.querySelector('.profile-dynamic');if(!target)return;
 const tabs=['Semua','Resto','Rating','Ulasan','Foto','Menu','Referensi'];
 const filtered=contributionTab==='Semua'?ownContributions:ownContributions.filter(c=>c.kind===contributionTab);
 target.innerHTML='<div class="profile-tabs profile-tabs-scroll">'+tabs.map(x=>'<button data-action="contribTab" data-value="'+x+'" class="'+(contributionTab===x?'selected':'')+'">'+x+'</button>').join('')+'</div>'+
 '<div class="profile-section-meta">'+ownContributions.length+' kontribusi terbaru</div>'+
 (filtered.length?'<div class="profile-contribution-list">'+filtered.map(c=>
 '<article class="profile-contribution-row">'+
 (c.resto_id?openCardButton('contribution',c.key,
  'Lihat '+c.title.toLowerCase()+' di '+nameOf(c.resto_id)):'')+
 '<span class="profile-contribution-icon">'+(c.photo?cover(c.photo):({Resto:'⌖',Rating:'☆',Ulasan:'▤',Foto:'▧',Menu:'♨',Referensi:'🔗'}[c.kind]||'•'))+'</span>'+
 '<div><strong>'+esc(c.title)+'</strong><small>'+esc(nameOf(c.resto_id))+' · '+esc(date(c.created_at))+'</small>'+
 (c.detail?'<p>'+esc(c.detail)+'</p>':'')+'</div>'+
 '</article>').join('')+'</div>':empty('Belum ada kontribusi pada kategori ini.'));
 restorePosition('contributions',ticket);
}
async function loadContributions(n){
 const uid=currentUser();
 const specs=[
  ['restos','id,name,created_at','created_by'],['ratings','resto_id,overall,created_at','user_id'],
  ['testimonials','resto_id,text,created_at','user_id'],['visit_photos','id,resto_id,storage_path,created_at','user_id'],
  ['menu_photos','id,resto_id,storage_path,created_at','user_id'],
  ['favorite_menu','id,resto_id,menu_item_id,menu_name,created_at','user_id'],
  ['references_link','id,resto_id,platform,url,created_at','user_id']
 ];
 try{
  const result=await Promise.all(specs.map(([table,select,col])=>sb.from(table).select(select).eq(col,uid).order('created_at',{ascending:false}).limit(100)));
  result.forEach(rows);
  ownContributions=result.flatMap((item,i)=>item.data.map(x=>{
   const type=specs[i][0],kind=kinds[type];
   return {
    key:type+':'+(x.id||x.resto_id),
    sourceType:type,
    sourceId:x.id||null,
    userId:uid,
    menuItemId:x.menu_item_id||null,
    menuName:x.menu_name||null,
    kind,resto_id:type==='restos'?x.id:x.resto_id,created_at:x.created_at,
    title:type==='restos'?'Menambahkan restoran':type==='ratings'?'Memberi rating '+Number(x.overall).toLocaleString('id-ID',{maximumFractionDigits:1})+'/5':type==='testimonials'?'Menulis ulasan':
      type==='visit_photos'?'Mengunggah foto kunjungan':type==='menu_photos'?'Mengunggah foto menu':type==='favorite_menu'?'Merekomendasikan menu':'Menambah referensi',
    detail:type==='testimonials'?x.text:type==='favorite_menu'?x.menu_name:type==='references_link'?x.platform:type==='restos'?x.name:'',
    photo:type==='visit_photos'||type==='menu_photos'?storageImage(x.storage_path):null
   };
  })).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  if(validStill(uid,n,'contributions'))renderContributions();
 }catch(err){if(validStill(uid,n,'contributions'))notice('Kontribusi gagal dimuat. '+err.message);}
}
// Social/system events are generated by database triggers, never inferred from partial client queries.
function notificationsFiltered(){
 const p=prefs();
 return notifications.filter(x=>(x.type==='Interaksi'?p.interaction:p.system)&&
  (notificationTab==='Semua'||notificationTab===x.type));
}
function notificationGlyph(kind){
 return ({like:'♡',comment:'◉',reply:'↩',follow:'+',report:'⚑',link:'↗',
  resto_submitted:'+',resto_verified:'✓',contribution:'★',new_resto:'⌖'})[kind]||'✦';
}
function renderNotifications(){
 if(page!=='notifications')return;
 const all=notificationsFiltered(),unseen=all.filter(x=>!x.read).length;
 const read=all.filter(x=>x.read),selected=read.filter(x=>notificationSelected.has(x.id));
 const disabled=notificationBusy?' disabled':'';
 root.querySelector('.profile-dynamic').innerHTML='<div class="profile-tabs">'+
 ['Semua','Interaksi','Sistem'].map(x=>'<button type="button" data-action="notificationTab" data-value="'+x+'" class="'+(notificationTab===x?'selected':'')+'">'+x+'</button>').join('')+
 '</div><div class="profile-notice-toolbar"><span>'+unseen+' belum dibaca pada daftar ini</span>'+
 '<button type="button" class="profile-compact-btn" data-action="markAllRead" '+(!unseen||notificationBusy?'disabled':'')+'>Tandai yang tampil dibaca</button></div>'+
 '<div class="profile-notice-toolbar"><span>'+read.length+' sudah dibaca pada daftar ini</span>'+
 '<button type="button" class="profile-compact-btn" data-action="notificationSelectMode"'+disabled+'>'+
 (notificationSelectMode?'Selesai memilih':'Pilih untuk hapus')+'</button>'+
 '<button type="button" class="profile-compact-btn" data-action="notificationDeleteAll"'+disabled+'>Hapus semua dibaca</button></div>'+
 (notificationSelectMode?'<div class="profile-notice-toolbar"><button type="button" class="profile-compact-btn" data-action="notificationSelectAll"'+disabled+'>Pilih semua yang tampil</button>'+
 '<button type="button" class="profile-compact-btn" data-action="notificationDeleteSelected"'+(!selected.length||notificationBusy?' disabled':'')+'>Hapus terpilih ('+selected.length+')</button></div>':'')+
 (all.length?'<div class="profile-notification-list">'+all.map(x=>
 '<div class="profile-notification-entry">'+
 (notificationSelectMode?'<label class="profile-notification-select"><input type="checkbox" data-notification-check="'+eattr(x.id)+'" aria-label="Pilih notifikasi '+eattr(x.title)+'" '+(notificationSelected.has(x.id)?'checked ':'')+(!x.read||notificationBusy?'disabled':'')+'></label>':'')+
 '<button type="button" class="profile-notification '+(!x.read?'unread':'')+'" data-action="notificationOpen" data-id="'+eattr(x.id)+'"'+disabled+'>'+
 '<span class="profile-notification-glyph" aria-hidden="true">'+notificationGlyph(x.kind)+'</span><span><strong>'+esc(x.title)+'</strong>'+
 '<small>'+esc(x.message)+'</small><em>'+esc(tinyDate(x.at))+'</em></span>'+
 (!x.read?'<i aria-label="Belum dibaca"></i>':'')+'</button>'+
 (!notificationSelectMode&&x.read?'<button type="button" class="profile-notification-delete" data-action="notificationDeleteOne" data-id="'+eattr(x.id)+'" aria-label="Hapus notifikasi '+eattr(x.title)+'" title="Hapus notifikasi"'+disabled+'>×</button>':'')+
 '</div>').join('')+'</div>':
 empty('Belum ada notifikasi untuk kategori ini.'))+
 (notificationHasMore?'<button type="button" class="profile-action profile-notification-more" data-action="notificationMore"'+disabled+'>Muat notifikasi sebelumnya</button>':'');
 restorePosition('notifications',ticket);
}
async function loadNotifications(n){
 const uid=currentUser(),request=++notificationRequest;
 if(!uid)return;
 try{
  // Pagination applies to durable events. Restaurant discovery stays a bounded, seven-day feed.
  const since=new Date(Date.now()-7*24*60*60*1000).toISOString();
  const [events,restosResult,seenResult,dismissedResult]=await Promise.all([
   sb.from('notifications').select('id,kind,title,message,actor_id,post_id,resto_id,report_id,link_submission_id,created_at,read_at')
    .eq('user_id',uid).order('created_at',{ascending:false}).limit(notificationLimit+1),
   sb.from('restos').select('id,name,address,created_by,created_at').gte('created_at',since)
    .order('created_at',{ascending:false}).limit(100),
   sb.from('seen_restos').select('resto_id').eq('user_id',uid),
   sb.from('dismissed_resto_notifications').select('resto_id').eq('user_id',uid)
  ]);
  const stored=rows(events),recent=rows(restosResult),seen=new Set(rows(seenResult).map(r=>r.resto_id)),dismissed=new Set(rows(dismissedResult).map(r=>r.resto_id));
  if(!validStill(uid,n,'notifications')||request!==notificationRequest)return;
  notificationHasMore=stored.length>notificationLimit;
  const list=stored.slice(0,notificationLimit).map(x=>({
   id:x.id,kind:x.kind,title:x.title,message:x.message,actor:x.actor_id,post:x.post_id,resto:x.resto_id,
   reports:!!x.report_id,contributions:!!x.link_submission_id||x.kind==='contribution',
   type:['like','comment','reply','follow'].includes(x.kind)?'Interaksi':'Sistem',
   at:x.created_at,read:!!x.read_at,persisted:true
  }));
  for(const r of recent){
   if(r.created_by===uid||dismissed.has(r.id))continue;
   list.push({id:'resto-'+r.id,kind:'new_resto',title:'Restoran baru: '+r.name,
    message:r.address||'Restoran baru tersedia di GastronoMap',at:r.created_at,
    type:'Sistem',resto:r.id,read:seen.has(r.id),persisted:false});
  }
  notifications=list.sort((a,b)=>new Date(b.at)-new Date(a.at));
  notificationSelected=new Set([...notificationSelected].filter(id=>notifications.some(x=>x.id===id&&x.read)));
  renderNotifications();
  loadNotificationBadge();
 }catch(err){
  if(validStill(uid,n,'notifications')&&request===notificationRequest)
   notice('Notifikasi gagal dimuat. '+err.message+' Silakan buka halaman ini kembali.');
 }
}
async function markNotificationsRead(items){
 const uid=currentUser();
 if(!uid||!items.length)return false;
 const ids=items.filter(x=>x.persisted&&!x.read).map(x=>x.id);
 const restos=items.filter(x=>!x.persisted&&!x.read&&x.resto).map(x=>x.resto);
 try{
  if(ids.length){
   const {error}=await sb.from('notifications').update({read_at:new Date().toISOString()})
    .eq('user_id',uid).in('id',ids);
   if(error)throw error;
  }
  if(restos.length){
   const {error}=await sb.from('seen_restos').upsert(restos.map(resto_id=>({resto_id,user_id:uid})),
    {onConflict:'resto_id,user_id'});
   if(error)throw error;
   restos.forEach(id=>seenRestoIds.add(id));
   if(typeof renderMarkers==='function')renderMarkers();
  }
  items.forEach(x=>x.read=true);
  renderNotifications();
  loadNotificationBadge();
  return true;
 }catch(err){
  showToast('Gagal menandai notifikasi dibaca: '+err.message);
  if(page==='notifications')loadNotifications(ticket);
  return false;
 }
}
async function deleteReadNotifications(mode,items=[]){
 if(notificationBusy||!currentUser())return;
 const uid=currentUser();
 if(mode==='selected'&&!items.length)return;
 const question=mode==='all'?'Hapus semua notifikasi yang sudah dibaca? Notifikasi belum dibaca akan tetap disimpan.':'Hapus '+items.length+' notifikasi yang dipilih?';
 if(!confirm(question+' Tindakan ini tidak dapat dibatalkan.'))return;
 notificationBusy=true;renderNotifications();
 try{
  if(mode==='all'){
   // DB RLS and read_at condition both protect unread notifications.
   const {error}=await sb.from('notifications').delete().eq('user_id',uid).not('read_at','is',null);
   if(error)throw error;
   // Synthetic restaurant notices can only be dismissed once they are marked seen.
   const since=new Date(Date.now()-7*24*60*60*1000).toISOString();
   const [restosResult,seenResult,dismissedResult]=await Promise.all([
    sb.from('restos').select('id,created_by').gte('created_at',since).limit(100),
    sb.from('seen_restos').select('resto_id').eq('user_id',uid),
    sb.from('dismissed_resto_notifications').select('resto_id').eq('user_id',uid)
   ]);
   const seen=new Set(rows(seenResult).map(x=>x.resto_id)),dismissed=new Set(rows(dismissedResult).map(x=>x.resto_id));
   const ids=rows(restosResult).filter(x=>x.created_by!==uid&&seen.has(x.id)&&!dismissed.has(x.id)).map(x=>x.id);
   if(ids.length){
    const result=await sb.from('dismissed_resto_notifications').insert(ids.map(resto_id=>({user_id:uid,resto_id})));
    if(result.error)throw result.error;
   }
  }else{
   const persisted=items.filter(x=>x.persisted&&x.read).map(x=>x.id);
   const synthetic=items.filter(x=>!x.persisted&&x.read&&x.resto).map(x=>x.resto);
   if(persisted.length){
    const {error}=await sb.from('notifications').delete().eq('user_id',uid).not('read_at','is',null).in('id',persisted);
    if(error)throw error;
   }
   if(synthetic.length){
    const {error}=await sb.from('dismissed_resto_notifications').insert(synthetic.map(resto_id=>({user_id:uid,resto_id})));
    if(error)throw error;
   }
  }
  if(uid!==currentUser())return;
  notificationSelected.clear();notificationSelectMode=false;
  showToast('Notifikasi yang sudah dibaca berhasil dihapus.');
 }catch(error){showToast('Gagal menghapus notifikasi: '+error.message);}
 finally{
  notificationBusy=false;
  if(uid===currentUser()){if(page==='notifications')loadNotifications(ticket);loadNotificationBadge();}
 }
}
async function loadNotificationBadge(){
 const uid=currentUser(),request=++badgeRequest;
 if(!uid){notificationUnreadCount=0;return;}
 try{
  const since=new Date(Date.now()-7*24*60*60*1000).toISOString();
  const active=prefs(),counts=[];
  if(active.interaction)counts.push(sb.from('notifications').select('id',{count:'exact',head:true})
   .eq('user_id',uid).is('read_at',null).in('kind',['like','comment','reply','follow']));
  if(active.system)counts.push(sb.from('notifications').select('id',{count:'exact',head:true})
   .eq('user_id',uid).is('read_at',null).in('kind',['report','link','resto_submitted','resto_verified','contribution']));
  const [countResults,restosResult,seenResult,dismissedResult]=await Promise.all([
   Promise.all(counts),
   active.system?sb.from('restos').select('id,created_by').gte('created_at',since).limit(100):Promise.resolve({data:[]}),
   active.system?sb.from('seen_restos').select('resto_id').eq('user_id',uid):Promise.resolve({data:[]}),
   active.system?sb.from('dismissed_resto_notifications').select('resto_id').eq('user_id',uid):Promise.resolve({data:[]})
  ]);
  countResults.forEach(x=>{if(x.error)throw x.error;});
  const restoRows=rows(restosResult),seen=new Set(rows(seenResult).map(x=>x.resto_id)),dismissed=new Set(rows(dismissedResult).map(x=>x.resto_id));
  if(uid!==currentUser()||request!==badgeRequest)return;
  notificationUnreadCount=countResults.reduce((total,x)=>total+(x.count||0),0)+
   restoRows.filter(x=>x.created_by!==uid&&!seen.has(x.id)&&!dismissed.has(x.id)).length;
  const badge=root.querySelector('[data-action="notifications"] .profile-menu-count');
  if(badge)badge.textContent=notificationUnreadCount?String(notificationUnreadCount):'0';
 }catch(err){console.error('Gagal menghitung notifikasi:',err);}
}
async function loadNotificationPreferences(uid){
 try{
  const {data,error}=await sb.from('notification_preferences').select('interaction,system').eq('user_id',uid).maybeSingle();
  if(error)throw error;
  if(uid!==currentUser())return;
  notificationPrefs={interaction:data?.interaction!==false,system:data?.system!==false};
  if(page==='settings')renderSettings();
  if(page==='notifications')renderNotifications();
  loadNotificationBadge();
 }catch(err){console.error('Gagal memuat preferensi notifikasi:',err);}
}
function subscribeNotifications(uid){
 if(notificationChannelUser===uid)return;
 if(notificationChannel)sb.removeChannel(notificationChannel);
 notificationChannel=null;notificationChannelUser=uid;
 if(!uid)return;
 notificationChannel=sb.channel('gm-notifications-'+uid).on('postgres_changes',
  {event:'*',schema:'public',table:'notifications',filter:'user_id=eq.'+uid},()=>{
   loadNotificationBadge();
   if(page==='notifications')loadNotifications(ticket);
  }).subscribe();
}
function renderSettings(){
 const p=prefs();
 root.innerHTML=heading('Settings','Preferensi yang tersimpan pada perangkat ini')+
 '<div class="profile-settings-card"><h3>Notifikasi</h3>'+
 '<label class="profile-setting"><span><strong>Interaksi Community</strong><small>Like, komentar, balasan, dan pengikut baru</small></span><input type="checkbox" data-setting="interaction" '+(p.interaction?'checked':'')+'></label>'+
 '<label class="profile-setting"><span><strong>Aktivitas Sistem</strong><small>Laporan, pengajuan link, dan restoran baru</small></span><input type="checkbox" data-setting="system" '+(p.system?'checked':'')+'></label>'+
 '<p class="profile-settings-hint">Preferensi dan status dibaca tersimpan di akun dan tersinkronisasi antarperangkat.</p></div>'+
 '<div class="profile-settings-card"><h3>Akun</h3><div class="profile-setting"><span><strong>Email</strong><small>'+esc(myEmail||'–')+'</small></span></div>'+
 '<div class="profile-setting"><span><strong>Versi cache</strong><small>gastronomap-v149</small></span></div></div>'+
 '';
}
async function openPost(id,returnToProfile=false){
 if(typeof window.openCommunityPost==='function')await window.openCommunityPost(id,{returnToProfile});
 else {navigatePrimaryView('community');if(typeof window.loadCommunityFeed==='function')await window.loadCommunityFeed();}
}
async function openResto(id){
 if(!resto(id)&&typeof loadAllRestos==='function')await loadAllRestos();
 if(!resto(id)){showToast('Restoran tidak tersedia.');return;}
 navigatePrimaryView('home');
 document.getElementById('detailPanel').classList.add('hidden');
 if(typeof openDetail==='function')openDetail(id);
}
async function openContribution(c){
 if(!c || !c.resto_id)return;
 try{
  // Detail data can be stale after a contribution was made in another session.
  let r=resto(c.resto_id);
  const missingSource=r && (
    (c.sourceType==='ratings' && !(r.ratings||[]).some(p=>p.userId===c.userId)) ||
    (c.sourceType==='testimonials' && !(r.testimonials||[]).some(p=>p.userId===c.userId)) ||
    (c.sourceType==='visit_photos' && !(r.photos||[]).some(p=>p.id===c.sourceId)) ||
    (c.sourceType==='menu_photos' && !(r.menuPhotos||[]).some(p=>p.id===c.sourceId)) ||
    (c.sourceType==='references_link' && !(r.references||[]).some(p=>p.id===c.sourceId)) ||
    (c.sourceType==='favorite_menu' && !(r.favoriteMenuEntries||[]).some(p=>p.id===c.sourceId))
  );
  if((!r||missingSource) && typeof loadAllRestos==='function'){
   await loadAllRestos();r=resto(c.resto_id);
  }
  if(!r){showToast('Restoran kontribusi ini sudah tidak tersedia.');return;}
  if(typeof openDetailContributionActivity!=='function'){
   showToast('Detail aktivitas belum tersedia.');return;
  }
  // The detail handler navigates only after verifying the source still exists.
  const ok=openDetailContributionActivity(c);
  if(!ok)showToast('Aktivitas ini tidak lagi tersedia di detail restoran.');
 }catch(error){
  console.error('Gagal membuka kontribusi:',error);
  showToast('Gagal membuka aktivitas kontribusi.');
 }
}
const rewardSourceTables={
 add_resto:'restos',rating:'ratings',testimoni:'testimonials',
 foto_kunjungan:'visit_photos',foto_menu:'menu_photos',
 link_referensi:'references_link',menu_rekomendasi:'favorite_menu',
 link_online:'online_link_submissions'
};
async function openPointActivity(entry){
 if(!entry || entry.reversed_at)return;
 if(entry.category==='community_post'){
  if(entry.source_kind!=='posts'||!entry.source_id){showToast('Sumber postingan tidak tersedia.');return;}
  const result=await sb.from('posts').select('id').eq('id',entry.source_id).maybeSingle();
  if(result.error){showToast('Gagal memeriksa postingan.');return;}
  if(!result.data){showToast('Postingan ini sudah tidak tersedia.');return;}
  await openPost(entry.source_id,true);return;
 }
 const kind=rewardSourceTables[entry.category];
 if(!kind||!entry.resto_id){showToast('Detail kontribusi ini tidak tersedia.');return;}
 const select=kind==='favorite_menu'?'id,menu_item_id,menu_name':
  kind==='online_link_submissions'?'id,platforms,status,user_id':
  kind==='restos'?'id,created_by':
  kind==='ratings'||kind==='testimonials'?'resto_id,user_id':'id,user_id';
 let query=sb.from(kind).select(select);
 if(entry.source_kind===kind && entry.source_id && !['ratings','testimonials'].includes(kind)){
  query=query.eq('id',entry.source_id);
 }else if(kind==='restos'){
  query=query.eq('id',entry.resto_id).eq('created_by',currentUser());
 }else{
  query=query.eq('resto_id',entry.resto_id).eq('user_id',currentUser());
  if(kind==='online_link_submissions')query=query.eq('status','approved');
 }
 const {data,error}=await query.limit(kind==='ratings'||kind==='testimonials'?1:2);
 if(error){showToast('Gagal memeriksa sumber poin.');return;}
 // Old rows without source_id must resolve to precisely one candidate.
 if(!data?.length||data.length>1){
  showToast(data?.length>1?'Sumber poin lama tidak dapat dipastikan.':'Aktivitas ini sudah tidak tersedia.');
  return;
 }
 const source=data[0];
 if((source.user_id&&source.user_id!==currentUser())||
    (source.created_by&&source.created_by!==currentUser())){
  showToast('Sumber poin tidak sesuai dengan akun.');return;
 }
 await openContribution({
  sourceType:kind,sourceId:source.id||null,resto_id:entry.resto_id,
  userId:currentUser(),menuItemId:source.menu_item_id||null,
  menuName:source.menu_name||null,
  platform:Array.isArray(source.platforms)?(typeof source.platforms[0]==='string'?source.platforms[0]:source.platforms[0]?.platform):null
 });
}
function legacy(id){document.getElementById(id)?.click();}
root.addEventListener('click',async (event)=>{
 const btn=event.target.closest('[data-action]');if(!btn||!root.contains(btn))return;
 const action=btn.dataset.action,id=btn.dataset.id;
 if(['notifications','saved','visited','posts','points','contributions','reports','settings','help'].includes(action)){openSubPage(action);return;}
 if(action==='home'){backProfile();return;}
 if(action==='login'){document.getElementById('loginOverlay').classList.remove('hidden');return;}
 if(action==='avatar'){document.getElementById('avatarInput').click();return;}
 if(action==='publicProfile'){window.openSocialProfile?.(currentUser(),{public:true});return;}
 if(action==='edit'){openProfileCompletionModal(true);return;}
 if(action==='logout'){signOut();return;}
 if(action==='resto'){openResto(id);return;}
 if(action==='contribution'){
  const item=ownContributions.find(c=>c.key===id);
  if(item)await openContribution(item);
  return;
 }
 if(action==='pointActivity'){
  const item=pointHistory.find(c=>String(c.id)===id);
  if(item)await openPointActivity(item);
  return;
 }
 if(action==='post'){await openPost(id);return;}
 if(action==='sendReport'){legacy('openReportBtn');return;}
 if(action==='myReports'){legacy('openMyReportsBtn');return;}
 if(action==='adminReports'){legacy('openAdminReportsBtn');return;}
 if(action==='adminLinks'){legacy('openAdminLinkSubmissionsBtn');return;}
 if(action==='usageGuide'){legacy('openUsageGuideBtn');return;}
 if(action==='installGuide'){legacy('openInstallGuideBtn');return;}
 if(action==='savedResto'||action==='savedPosts'){savedTab=action==='savedResto'?'resto':'posts';renderSavedContent();return;}
 if(action==='contribTab'){contributionTab=btn.dataset.value;renderContributions();return;}
 if(action==='notificationTab'){notificationTab=btn.dataset.value;renderNotifications();return;}
 if(action==='notificationSelectMode'){notificationSelectMode=!notificationSelectMode;notificationSelected.clear();renderNotifications();return;}
 if(action==='notificationSelectAll'){notificationsFiltered().filter(x=>x.read).forEach(x=>notificationSelected.add(x.id));renderNotifications();return;}
 if(action==='notificationDeleteOne'){const x=notifications.find(x=>x.id===id);if(x?.read)await deleteReadNotifications('selected',[x]);return;}
 if(action==='notificationDeleteSelected'){await deleteReadNotifications('selected',notifications.filter(x=>notificationSelected.has(x.id)&&x.read));return;}
 if(action==='notificationDeleteAll'){await deleteReadNotifications('all');return;}
 if(action==='notificationMore'){notificationLimit+=50;loadNotifications(ticket);return;}
 if(action==='markAllRead'){await markNotificationsRead(notificationsFiltered().filter(x=>!x.read));return;}
 if(action==='notificationOpen'){
  const x=notifications.find(x=>x.id===id);if(!x)return;
  if(!x.read)await markNotificationsRead([x]);
  if(x.kind==='follow'&&x.actor)window.openSocialProfile?.(x.actor);
  else if(x.post)await openPost(x.post,true);
  else if(x.kind==='report')legacy('openMyReportsBtn');
  else if(x.kind==='link')openSubPage('contributions');
  else if(x.kind==='contribution')openSubPage('points');
  else if(x.resto)await openResto(x.resto);
  return;
 }
 if(action==='removeWishlist'){
  btn.disabled=true;
  const {error}=await sb.from('wishlist').delete().eq('user_id',currentUser()).eq('resto_id',id);
  if(error){showToast('Gagal menghapus wishlist');btn.disabled=false;return;}
  wishlistIds.delete(id);savedRestos=savedRestos.filter(r=>r.id!==id);
  if(typeof renderMarkers==='function')renderMarkers();
  renderSavedContent();return;
 }
 if(action==='removeSavedPost'){
  btn.disabled=true;
  const {error}=await sb.from('post_saves').delete().eq('user_id',currentUser()).eq('post_id',id);
  if(error){showToast('Gagal menghapus simpanan');btn.disabled=false;return;}
  savedPosts=savedPosts.filter(p=>p.id!==id);renderSavedContent();return;
 }
 if(action==='removeVisited'){
  btn.disabled=true;
  const {error}=await sb.from('visited').delete().eq('user_id',currentUser()).eq('resto_id',id);
  if(error){showToast('Gagal memperbarui kunjungan');btn.disabled=false;return;}
  visitedIds.delete(id);visitedRestos=visitedRestos.filter(x=>x.r.id!==id);
  if(typeof renderMarkers==='function')renderMarkers();
  setPage('visited',{restore:true});return;
 }
 if(action==='editPost'){
  const post=ownPosts.find(x=>x.id===id),card=btn.closest('.profile-post-card');
  if(!post||!card)return;
  card.classList.add('is-editing'); // Disable the full-card overlay while typing.
  const body=card.querySelector('.profile-post-body p');
  body.outerHTML='<textarea class="profile-post-editor" maxlength="5000" aria-label="Edit caption">'+esc(post.caption||'')+'</textarea>';
  card.querySelector('.profile-post-buttons').innerHTML='<button type="button" class="profile-compact-btn" data-action="savePost" data-id="'+eattr(id)+'">Simpan</button><button type="button" class="profile-compact-btn" data-action="cancelEdit">Batal</button>';
  card.querySelector('textarea').focus();return;
 }
 if(action==='cancelEdit'){setPage('posts',{restore:true});return;}
 if(action==='savePost'){
  const card=btn.closest('.profile-post-card'),text=card.querySelector('textarea')?.value.trim();
  if(text===undefined)return;
  btn.disabled=true;
  const result=await sb.from('posts').update({caption:text,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',currentUser());
  if(result.error){showToast('Gagal memperbarui postingan: '+result.error.message);btn.disabled=false;return;}
  showToast('Postingan diperbarui');setPage('posts',{restore:true});return;
 }
 if(action==='deletePost'){
  if(!confirm('Hapus postingan beserta foto dan komentarnya? Tindakan ini tidak dapat dibatalkan.'))return;
  const uid=currentUser(),post=ownPosts.find(x=>x.id===id);btn.disabled=true;
  const result=await sb.from('posts').delete().eq('id',id).eq('user_id',uid);
  if(result.error){showToast('Gagal menghapus postingan');btn.disabled=false;return;}
  if(post?.media?.length){
   const base=sb.storage.from('community-posts').getPublicUrl('').data.publicUrl;
   const paths=post.media.map(m=>m.url.startsWith(base)?decodeURIComponent(m.url.slice(base.length)).replace(/^\/+/,''):null).filter(Boolean);
   if(paths.length)await sb.storage.from('community-posts').remove(paths);
  }
  showToast('Postingan dihapus');setPage('posts',{restore:true});return;
 }
});
root.addEventListener('change',async (event)=>{
 const check=event.target.closest('[data-notification-check]');
 if(check){const x=notifications.find(n=>n.id===check.dataset.notificationCheck);if(!x?.read)return;
  if(check.checked)notificationSelected.add(x.id);else notificationSelected.delete(x.id);
  renderNotifications();return;}
 const el=event.target.closest('[data-setting]');if(!el)return;
 const uid=currentUser(),field=el.dataset.setting;
 if(!uid||!['interaction','system'].includes(field))return;
 const before={...notificationPrefs};
 notificationPrefs={...notificationPrefs,[field]:el.checked};
 el.disabled=true;
 const {error}=await sb.from('notification_preferences').upsert({
  user_id:uid,interaction:notificationPrefs.interaction,system:notificationPrefs.system,
  updated_at:new Date().toISOString()},{onConflict:'user_id'});
 if(error){notificationPrefs=before;el.checked=before[field];showToast('Gagal menyimpan preferensi: '+error.message);}
 el.disabled=false;
 loadNotificationBadge();
 if(page==='notifications')renderNotifications();
});
window.openProfilePoints=function(){ setPage('points'); };
window.renderProfileDashboard=function(){
 const uid=currentUser();
 if(profileUser!==uid){
   profileUser=uid;backStack.length=0;pointHistory=[];
   notificationPrefs={interaction:true,system:true};notificationUnreadCount=0;
   notificationRequest++;notificationSelectMode=false;notificationSelected.clear();subscribeNotifications(uid);
   if(uid)loadNotificationPreferences(uid);
   Object.keys(pageScroll).forEach(key=>delete pageScroll[key]);
   savedTab='resto';contributionTab='Semua';notificationTab='Semua';
   page='main';root.innerHTML='';scrollContainer().scrollTop=0;
 }
 // Refreshes from avatar/profile edits must retain the prior screen and scroll.
 setPage(page,{restore:true});
 if(uid)loadNotificationBadge();
};
window.openProfileNotifications=function(){
 if(typeof navigatePrimaryView==='function')navigatePrimaryView('profile');
 if(currentUser())setPage('notifications');
};
})();