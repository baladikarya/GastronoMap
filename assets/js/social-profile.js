/* GastronoMap P2 Tahap 11 — public social identity and follow relationships. */
(()=>{
'use strict';
const uid=()=>typeof myUserId==='string'&&myUserId?myUserId:null;
const validId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const say=message=>typeof showToast==='function'?showToast(message):console.warn(message);
const number=n=>Number(n||0).toLocaleString('id-ID');
const date=value=>new Date(value).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
const nameOf=p=>p?.username?.trim()||'Pengguna GastronoMap';
const el=(tag,klass,text)=>{
 const node=document.createElement(tag);if(klass)node.className=klass;
 if(text!==undefined)node.textContent=text;return node;
};
const btn=(text,klass,handler)=>{
 const node=el('button',klass,text);node.type='button';if(handler)node.addEventListener('click',handler);return node;
};
const safePhoto=url=>typeof url==='string'&&/^https:\/\//i.test(url)?url:null;
const overlay=el('section','social-profile-overlay');
overlay.id='socialProfileOverlay';overlay.hidden=true;
overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
overlay.setAttribute('aria-label','Profil publik GastronoMap');
const shell=el('div','social-profile-shell');
overlay.append(shell);document.body.append(overlay);
const state={id:null,profile:null,view:'profile',token:0,postOffset:0,postLoading:false,followed:false,
 followers:0,following:0,posts:0};
let previousFocus=null;
function content(title,onBack){
 shell.replaceChildren();
 const header=el('header','social-profile-toolbar');
 header.append(btn('←','social-profile-back',onBack||close));
 header.append(el('h1','',title));
 header.append(btn('✕','social-profile-close',close));
 const body=el('main','social-profile-content');
 shell.append(header,body);
 return body;
}
function message(body,text,retry){
 body.replaceChildren();
 const wrap=el('div','social-profile-state',text);
 if(retry)wrap.append(btn('Coba lagi','social-profile-secondary',retry));
 body.append(wrap);
}
function dismiss(){
 overlay.hidden=true;state.token++;state.id=null;state.profile=null;
 document.body.classList.remove('social-profile-open');
 if(previousFocus?.isConnected)previousFocus.focus();
 previousFocus=null;
}
function close(){
 if(overlay.hidden)return;
 if(history.state?.gmSocialUser){history.back();return;}
 dismiss();
}
function open(id,options={}){
 if(!validId(id))return;
 if(id===uid()){
  if(!overlay.hidden){history.replaceState({...history.state,gmSocialUser:null},'',location.href);dismiss();}
  if(typeof navigatePrimaryView==='function')navigatePrimaryView('profile');
  window.openProfileHome?.();
  return;
 }
 const wasHidden=overlay.hidden;
 if(wasHidden)previousFocus=document.activeElement;
 overlay.hidden=false;document.body.classList.add('social-profile-open');
 state.id=id;state.view='profile';state.postOffset=0;state.followed=false;
 const current=history.state||{};
 const next={...current,gmSocialUser:id};
 if(wasHidden)history.pushState(next,'',location.href);
 else history.replaceState(next,'',location.href);
 loadProfile(id);
 requestAnimationFrame(()=>shell.querySelector('button')?.focus());
}
async function loadProfile(id){
 const token=++state.token;
 const body=content('Profil Publik');
 message(body,'Memuat profil pengguna…');
 try{
  const tasks=[
   sb.from('public_social_profiles')
    .select('id,username,avatar_url,bio,city,is_verified_contributor,resto_approved_count,full_review_count')
    .eq('id',id).maybeSingle(),
   sb.from('posts').select('id',{head:true,count:'exact'}).eq('user_id',id),
   sb.from('user_follows').select('follower_id',{head:true,count:'exact'}).eq('following_id',id),
   sb.from('user_follows').select('following_id',{head:true,count:'exact'}).eq('follower_id',id)
  ];
  if(uid())tasks.push(sb.from('user_follows').select('follower_id').eq('follower_id',uid()).eq('following_id',id).maybeSingle());
  const results=await Promise.all(tasks);
  if(token!==state.token||state.id!==id)return;
  for(const result of results)if(result.error)throw result.error;
  if(!results[0].data){message(body,'Profil pengguna tidak ditemukan.');return;}
  state.profile=results[0].data;
  state.posts=results[1].count||0;state.followers=results[2].count||0;
  state.following=results[3].count||0;state.followed=!!results[4]?.data;
  renderProfile();
 }catch(error){
  if(token!==state.token)return;
  console.error('Public Profile:',error);
  message(body,'Profil gagal dimuat. Pastikan migration Social Profile sudah diterapkan.',()=>loadProfile(id));
 }
}
function renderProfile(){
 if(overlay.hidden||!state.profile)return;
 // Re-render after follow/list navigation starts a fresh first page.
 state.token++;state.postOffset=0;state.postLoading=false;
 const id=state.id,p=state.profile;
 state.view='profile';
 const body=content('Profil Publik');
 const cover=el('div','social-profile-cover');body.append(cover);
 const intro=el('div','social-profile-identity');
 const portrait=el('div','social-profile-portrait');
 const url=safePhoto(p.avatar_url);
 if(url){const image=el('img');image.src=url;image.alt='Foto profil '+nameOf(p);image.loading='lazy';portrait.append(image);}
 else portrait.append(el('span','',nameOf(p).slice(0,1).toUpperCase()));
 intro.append(portrait,el('h2','',nameOf(p)));
 intro.append(el('p','social-profile-handle','@'+nameOf(p)));
 if(p.city)intro.append(el('p','social-profile-city','⌖ '+p.city));
 if(p.is_verified_contributor)intro.append(el('span','social-profile-verified','✓ Verified Contributor'));
 if(p.bio)intro.append(el('p','social-profile-bio',p.bio));
 body.append(intro);
 const stats=el('div','social-profile-stats');
 const entries=[
  [state.posts,'Postingan',null],
  [state.followers,'Followers',()=>showList('followers')],
  [state.following,'Following',()=>showList('following')]
 ];
 for(const [value,label,action] of entries){
  const cell=btn('','social-profile-stat'+(action?' is-clickable':''),action);
  cell.append(el('strong','',number(value)),el('small','',label));
  if(!action)cell.disabled=true;
  stats.append(cell);
 }
 body.append(stats);
 const actions=el('div','social-profile-actions');
 if(id!==uid()){
  const follow=btn(state.followed?'✓ Following':'+ Follow','social-profile-follow'+(state.followed?' is-following':''),()=>toggleFollow(follow,id));
  if(!uid()){follow.textContent='Login untuk Follow';}
  follow.setAttribute('aria-pressed',String(state.followed));
  actions.append(follow);
  const report=btn('Laporkan Akun','social-profile-secondary',()=>{
   window.openContentReport?.({type:'user',id,name:nameOf(p)});
  });
  report.setAttribute('aria-label','Laporkan akun '+nameOf(p));
  actions.append(report);
 }
 body.append(actions);
 const contributions=el('div','social-profile-contributions');
 contributions.append(el('span','',number(p.resto_approved_count)+' resto disetujui'),
                      el('span','',number(p.full_review_count)+' review lengkap'));
 body.append(contributions);
 body.append(el('h3','social-profile-section-title','Postingan Community'));
 const grid=el('div','social-profile-posts');grid.id='socialProfilePosts';body.append(grid);
 const more=btn('Muat postingan lainnya','social-profile-secondary social-profile-more',loadMorePosts);
 more.id='socialProfileMore';more.hidden=true;body.append(more);
 loadMorePosts();
}
async function loadMorePosts(){
 if(state.postLoading||state.view!=='profile'||!state.id)return;
 const id=state.id,token=state.token,offset=state.postOffset;
 const grid=overlay.querySelector('#socialProfilePosts'),more=overlay.querySelector('#socialProfileMore');
 if(!grid||!more)return;
 state.postLoading=true;more.disabled=true;more.hidden=true;
 if(!offset)grid.append(el('div','social-profile-state','Memuat postingan…'));
 try{
  const response=await sb.from('posts').select('id,caption,created_at,location_name')
   .eq('user_id',id).order('created_at',{ascending:false}).range(offset,offset+23);
  if(response.error)throw response.error;
  const posts=response.data||[];
  const ids=posts.map(post=>post.id);
  const mediaResult=ids.length?await sb.from('post_media').select('post_id,url,position').in('post_id',ids).order('position',{ascending:true}):{data:[]};
  if(mediaResult.error)throw mediaResult.error;
  if(token!==state.token||state.view!=='profile'||id!==state.id)return;
  if(!offset)grid.replaceChildren();
  const firstPhoto=new Map();
  for(const photo of mediaResult.data||[])if(!firstPhoto.has(photo.post_id))firstPhoto.set(photo.post_id,photo.url);
  for(const post of posts){
   const card=btn('','social-profile-post',()=>{
    history.replaceState({...history.state,gmSocialUser:null},'',location.href);
    dismiss();
    if(typeof window.openCommunityPost==='function')window.openCommunityPost(post.id);
   });
   const photo=safePhoto(firstPhoto.get(post.id));
   if(photo){const img=el('img','social-profile-post-photo');img.src=photo;img.alt='Foto postingan';img.loading='lazy';card.append(img);}
   else card.append(el('div','social-profile-post-placeholder','Cerita Kuliner'));
   card.append(el('strong','',post.caption?.trim().slice(0,110)||'Lihat cerita'));
   card.append(el('small','',date(post.created_at)+(post.location_name?' · '+post.location_name:'')));
   grid.append(card);
  }
  state.postOffset+=posts.length;
  if(!state.postOffset)grid.append(el('p','social-profile-state','Belum ada postingan Community.'));
  more.hidden=posts.length<24;more.disabled=false;
 }catch(error){
  if(token===state.token){
   if(!offset)grid.replaceChildren(el('p','social-profile-state','Gagal memuat postingan.'));
   more.textContent='Coba lagi memuat postingan';more.hidden=false;more.disabled=false;
   say('Postingan profil belum dapat dimuat.');
  }
 }finally{if(token===state.token)state.postLoading=false;}
}
async function toggleFollow(button,id){
 const who=uid();
 if(!who){
  history.replaceState({...history.state,gmSocialUser:null},'',location.href);dismiss();
  document.getElementById('loginOverlay')?.classList.remove('hidden');return;
 }
 if(who===id)return;
 button.disabled=true;
 try{
  const wasFollowing=state.followed;
  const result=wasFollowing
   ?await sb.from('user_follows').delete().eq('follower_id',who).eq('following_id',id)
   :await sb.from('user_follows').insert({follower_id:who,following_id:id});
  if(result.error)throw result.error;
  if(state.id!==id||state.view!=='profile')return;
  state.followed=!wasFollowing;
  state.followers=Math.max(0,state.followers+(wasFollowing?-1:1));
  renderProfile();
  window.dispatchEvent(new CustomEvent('gm-follow-changed',{detail:{userId:id,following:state.followed}}));
 }catch(error){
  console.error('Follow:',error);say('Gagal memperbarui Follow. Coba lagi.');
 }finally{button.disabled=false;}
}
async function showList(kind){
 const id=state.id,token=++state.token;
 state.view=kind;
 const isFollowers=kind==='followers';
 const title=isFollowers?'Followers':'Following';
 const body=content(title,()=>{state.token++;renderProfile();});
 message(body,'Memuat '+title.toLowerCase()+'…');
 try{
  const column=isFollowers?'follower_id':'following_id';
  const filter=isFollowers?'following_id':'follower_id';
  const result=await sb.from('user_follows').select(column).eq(filter,id)
   .order('created_at',{ascending:false}).limit(100);
  if(result.error)throw result.error;
  const ids=(result.data||[]).map(item=>item[column]);
  const profiles=ids.length?await sb.from('public_social_profiles')
   .select('id,username,avatar_url,city,is_verified_contributor').in('id',ids):{data:[]};
  if(profiles.error)throw profiles.error;
  if(token!==state.token||id!==state.id)return;
  body.replaceChildren();
  if(!ids.length){message(body,'Belum ada '+title.toLowerCase()+'.');return;}
  const byId=new Map((profiles.data||[]).map(p=>[p.id,p]));
  for(const userId of ids){
   const person=byId.get(userId);if(!person)continue;
   const item=btn('','social-profile-person',()=>open(userId));
   const portrait=el('span','social-profile-list-avatar');
   const url=safePhoto(person.avatar_url);
   if(url){const pic=el('img');pic.src=url;pic.alt='';pic.loading='lazy';portrait.append(pic);}
   else portrait.textContent=nameOf(person).slice(0,1).toUpperCase();
   const labels=el('span','social-profile-person-label');
   labels.append(el('strong','',nameOf(person)),
    el('small','',[person.city,person.is_verified_contributor?'Verified Contributor':''].filter(Boolean).join(' · ')));
   item.append(portrait,labels,el('span','', '›'));body.append(item);
  }
  if(ids.length===100)body.append(el('small','social-profile-list-hint','Menampilkan 100 pengguna terbaru.'));
 }catch(error){
  if(token===state.token){console.error('Follow list:',error);message(body,'Gagal memuat '+title.toLowerCase()+'.',()=>showList(kind));}
 }
}

/* Own social profile is the main Profile tab, not a second modal.
   Keep its requests and DOM separate from the public profile overlay. */
const own={id:null,container:null,token:0,offset:0,loading:false,ready:null};
function ownValid(id,token){
 return own.id===id&&own.token===token&&own.container?.isConnected&&uid()===id;
}
function ownNotice(container,text){
 container.replaceChildren(el('p','social-profile-state',text));
}
async function renderOwnSocialProfile(container,options={}){
 const id=uid(),token=++own.token;
 own.id=id;own.container=container;own.offset=0;own.loading=false;
 own.ready=typeof options.onReady==='function'?options.onReady:null;
 if(!container)return;
 if(!id){ownNotice(container,'Masuk untuk melihat profil.');own.ready?.();return;}
 ownNotice(container,'Memuat profil dan postingan…');
 try{
  const results=await Promise.all([
   sb.from('public_social_profiles')
    .select('id,username,avatar_url,bio,city,is_verified_contributor,resto_approved_count,full_review_count')
    .eq('id',id).maybeSingle(),
   sb.from('posts').select('id',{head:true,count:'exact'}).eq('user_id',id),
   sb.from('user_follows').select('follower_id',{head:true,count:'exact'}).eq('following_id',id),
   sb.from('user_follows').select('following_id',{head:true,count:'exact'}).eq('follower_id',id)
  ]);
  if(!ownValid(id,token))return;
  for(const r of results)if(r.error)throw r.error;
  const p=results[0].data;
  if(!p){
   ownNotice(container,'Profil belum tersedia. Lengkapi informasi akun Anda.');
   container.append(btn('Edit Profile','social-profile-secondary social-profile-own-edit',
    ()=>window.openProfileCompletionModal?.(true)));
   own.ready?.();return;
  }
  container.replaceChildren();
  container.append(el('div','social-profile-cover'));
  const identity=el('div','social-profile-identity');
  const avatar=btn('','social-profile-portrait social-profile-own-avatar',()=>document.getElementById('avatarInput')?.click());
  avatar.setAttribute('aria-label','Ubah foto profil');
  const photo=safePhoto(p.avatar_url);
  if(photo){const img=el('img');img.src=photo;img.alt='Foto profil';img.loading='lazy';avatar.append(img);}
  else avatar.append(el('span','',nameOf(p).slice(0,1).toUpperCase()));
  identity.append(avatar,el('h2','',nameOf(p)),el('p','social-profile-handle','@'+nameOf(p)));
  if(p.city)identity.append(el('p','social-profile-city','⌖ '+p.city));
  if(p.is_verified_contributor)identity.append(el('span','social-profile-verified','✓ Verified Contributor'));
  if(p.bio)identity.append(el('p','social-profile-bio',p.bio));
  // Keep the social links previously shown on the private Profile landing.
  const socials=[];
  for(const [label,raw,base] of [
   ['Instagram',typeof myInstagram==='string'?myInstagram:'','https://instagram.com/'],
   ['TikTok',typeof myTiktok==='string'?myTiktok:'','https://www.tiktok.com/@']
  ]){
   const handle=raw.replace(/^@/,'').replace(/[^a-zA-Z0-9._]/g,'');
   if(handle)socials.push([label,base+handle]);
  }
  if(typeof myWebsite==='string'&&myWebsite.trim()){
   try{
    const website=new URL(myWebsite.trim());
    if(['https:','http:'].includes(website.protocol))socials.push(['Website',website.href]);
   }catch(_){}
  }
  if(socials.length){
   const links=el('div','social-profile-socials');
   for(const [label,url] of socials){
    const link=el('a','social-profile-social',label);
    link.href=url;link.target='_blank';link.rel='noopener noreferrer';
    links.append(link);
   }
   identity.append(links);
  }
  container.append(identity);
  const stats=el('div','social-profile-stats');
  const counts=[
   [results[1].count||0,'Postingan',()=>container.querySelector('#ownSocialPosts')?.scrollIntoView({behavior:'smooth',block:'start'})],
   [results[2].count||0,'Followers',()=>window.openProfileFollowList?.('followers')],
   [results[3].count||0,'Following',()=>window.openProfileFollowList?.('following')]
  ];
  for(const [value,label,action] of counts){
   const stat=btn('','social-profile-stat is-clickable',action);
   stat.append(el('strong','',number(value)),el('small','',label));
   if(label==='Postingan')stat.id='ownSocialPostCount';
   stats.append(stat);
  }
  container.append(stats);
  const edit=btn('✎  Edit Profile','social-profile-secondary social-profile-own-edit',()=>window.openProfileCompletionModal?.(true));
  container.append(edit);
  const contributions=el('div','social-profile-contributions');
  contributions.append(el('span','',number(p.resto_approved_count)+' resto disetujui'),
   el('span','',number(p.full_review_count)+' review lengkap'));
  container.append(contributions);
  const title=el('h3','social-profile-section-title','Postingan Community');
  title.id='ownSocialPosts';container.append(title);
  const grid=el('div','social-profile-posts');grid.id='ownSocialPostGrid';container.append(grid);
  const more=btn('Muat postingan lainnya','social-profile-secondary social-profile-more',()=>loadOwnPosts(id,token));
  more.id='ownSocialPostMore';more.hidden=true;container.append(more);
  await loadOwnPosts(id,token);
 }catch(error){
  if(!ownValid(id,token))return;
  console.error('Profile utama:',error);
  ownNotice(container,'Gagal memuat profil. Coba lagi.');
  container.append(btn('Muat ulang','social-profile-secondary',()=>renderOwnSocialProfile(container,options)));
  own.ready?.();
 }
}
async function loadOwnPosts(id,token){
 if(!ownValid(id,token)||own.loading)return;
 const container=own.container,grid=container.querySelector('#ownSocialPostGrid');
 const more=container.querySelector('#ownSocialPostMore');
 if(!grid||!more)return;
 const offset=own.offset;
 own.loading=true;more.hidden=true;more.disabled=true;
 if(!offset)grid.append(el('p','social-profile-state','Memuat postingan…'));
 try{
  const response=await sb.from('posts').select('id,caption,created_at,location_name')
   .eq('user_id',id).order('created_at',{ascending:false}).range(offset,offset+23);
  if(response.error)throw response.error;
  const posts=response.data||[],ids=posts.map(p=>p.id);
  const media=ids.length?await sb.from('post_media').select('post_id,url,thumbnail_url,position')
   .in('post_id',ids).order('position',{ascending:true}):{data:[]};
  if(media.error)throw media.error;
  if(!ownValid(id,token))return;
  if(!offset)grid.replaceChildren();
  const photos=new Map(),mediaByPost=new Map();
  for(const m of media.data||[]){
   if(!photos.has(m.post_id))photos.set(m.post_id,m.thumbnail_url||m.url);
   if(!mediaByPost.has(m.post_id))mediaByPost.set(m.post_id,[]);
   mediaByPost.get(m.post_id).push(m);
  }
  for(const post of posts)grid.append(ownPostCard(post,photos.get(post.id),mediaByPost.get(post.id)||[],id));
  own.offset+=posts.length;
  if(!own.offset)grid.append(el('p','social-profile-state','Belum ada postingan Community.'));
  more.hidden=posts.length<24;more.disabled=false;
 }catch(error){
  if(ownValid(id,token)){
   console.error('Postingan profil:',error);
   if(!offset)grid.replaceChildren(el('p','social-profile-state','Gagal memuat postingan.'));
   more.textContent='Coba lagi';more.hidden=false;more.disabled=false;
  }
 }finally{
  if(ownValid(id,token)){
   own.loading=false;
   if(!offset){const ready=own.ready;own.ready=null;ready?.();}
  }
 }
}
function ownPostCard(post,photo,media,id){
 const card=el('article','social-profile-own-post');
 const openPost=btn('','social-profile-post social-profile-post-open',()=>{
  if(typeof window.openCommunityPost==='function')window.openCommunityPost(post.id,{returnToProfile:true});
 });
 openPost.setAttribute('aria-label','Buka postingan '+(post.caption?.trim().slice(0,55)||'Community'));
 const image=safePhoto(photo);
 if(image){const img=el('img','social-profile-post-photo');img.src=image;img.alt='Foto postingan';img.loading='lazy';openPost.append(img);}
 else openPost.append(el('div','social-profile-post-placeholder','Cerita Kuliner'));
 const caption=el('strong','',post.caption?.trim().slice(0,110)||'Lihat cerita');
 openPost.append(caption,el('small','',date(post.created_at)+(post.location_name?' · '+post.location_name:'')));
 card.append(openPost);
 const menu=btn('⋯','social-profile-post-options',()=>{
  actions.hidden=!actions.hidden;
  menu.setAttribute('aria-expanded',String(!actions.hidden));
 });
 menu.setAttribute('aria-label','Opsi postingan milik sendiri');
 menu.setAttribute('aria-expanded','false');
 const actions=el('div','social-profile-own-post-actions');actions.hidden=true;
 const edit=btn('Edit','social-profile-secondary',()=>{
  actions.hidden=true;menu.setAttribute('aria-expanded','false');
  editor.hidden=false;card.classList.add('is-editing');
  textarea.value=post.caption||'';textarea.focus();
 });
 const remove=btn('Hapus','social-profile-secondary social-profile-delete',async()=>{
  if(!window.confirm('Hapus postingan beserta foto dan komentarnya? Tindakan tidak dapat dibatalkan.'))return;
  remove.disabled=true;
  try{
   const result=await sb.from('posts').delete().eq('id',post.id).eq('user_id',id);
   if(result.error)throw result.error;
   const base=sb.storage.from('community-posts').getPublicUrl('').data.publicUrl;
   const paths=media.flatMap(m=>[m.url,m.thumbnail_url]).filter(Boolean)
    .filter(url=>url.startsWith(base)).map(url=>decodeURIComponent(url.slice(base.length)).replace(/^\/+/,''));
   if(paths.length){
    const removed=await sb.storage.from('community-posts').remove([...new Set(paths)]);
    if(removed.error)console.warn('Cleanup media:',removed.error);
   }
   card.remove();
   own.offset=Math.max(0,own.offset-1);
   const count=own.container?.querySelector('#ownSocialPostCount strong');
   if(count)count.textContent=number(Math.max(0,Number(count.textContent.replace(/\D/g,''))-1));
   if(!own.container?.querySelector('.social-profile-own-post')){
    const grid=own.container?.querySelector('#ownSocialPostGrid');
    if(grid)grid.append(el('p','social-profile-state','Belum ada postingan Community.'));
   }
   say('Postingan dihapus.');
  }catch(error){console.error('Hapus postingan:',error);say('Gagal menghapus postingan.');remove.disabled=false;}
 });
 actions.append(edit,remove);
 const editor=el('div','social-profile-own-editor');editor.hidden=true;
 const textarea=el('textarea');textarea.maxLength=5000;textarea.setAttribute('aria-label','Edit caption postingan');
 const save=btn('Simpan','social-profile-secondary',async()=>{
  const value=textarea.value.trim();save.disabled=true;
  try{
   const result=await sb.from('posts').update({caption:value,updated_at:new Date().toISOString()})
    .eq('id',post.id).eq('user_id',id);
   if(result.error)throw result.error;
   post.caption=value;caption.textContent=value.slice(0,110)||'Lihat cerita';
   editor.hidden=true;card.classList.remove('is-editing');say('Postingan diperbarui.');
  }catch(error){console.error('Edit postingan:',error);say('Gagal menyimpan postingan.');}
  finally{save.disabled=false;}
 });
 const cancel=btn('Batal','social-profile-secondary',()=>{editor.hidden=true;card.classList.remove('is-editing');});
 editor.append(textarea,save,cancel);
 card.append(menu,actions,editor);
 return card;
}
window.renderOwnSocialProfile=renderOwnSocialProfile;
window.refreshOwnSocialProfile=()=>{
 if(own.container?.isConnected&&own.id===uid())renderOwnSocialProfile(own.container);
};

overlay.addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();close();}
 if(event.key==='Tab'){
  const focusables=[...shell.querySelectorAll('button:not(:disabled):not([hidden]),a[href]')].filter(x=>x.offsetParent!==null);
  if(!focusables.length)return;
  const first=focusables[0],last=focusables[focusables.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
window.addEventListener('popstate',event=>{
 if(overlay.hidden)return;
 if(!event.state?.gmSocialUser)dismiss();
 else if(event.state.gmSocialUser!==state.id){state.id=event.state.gmSocialUser;state.postOffset=0;loadProfile(state.id);}
});
window.openSocialProfile=open;
window.closeSocialProfile=()=>{if(!overlay.hidden){history.replaceState({...history.state,gmSocialUser:null},'',location.href);dismiss();}};
window.dispatchEvent(new Event('gm-social-profile-ready'));
})();
