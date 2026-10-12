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
 if(id===uid()&&!options.public){
  if(!overlay.hidden){history.replaceState({...history.state,gmSocialUser:null},'',location.href);dismiss();}
  if(typeof navigatePrimaryView==='function')navigatePrimaryView('profile');
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
    .select('id,username,avatar_url,bio,city,website_url,instagram,tiktok,is_verified_contributor,resto_approved_count,full_review_count')
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
function socialLink(label,url){
 try{
  const parsed=new URL(url);
  if(parsed.protocol!=='https:')return null;
  const a=el('a','social-profile-social',label);
  a.href=parsed.href;a.target='_blank';a.rel='noopener noreferrer';return a;
 }catch(_){return null;}
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
 const socials=el('div','social-profile-socials');
 const handles=[
  p.instagram?socialLink('Instagram','https://instagram.com/'+p.instagram.replace(/^@/,'')):null,
  p.tiktok?socialLink('TikTok','https://www.tiktok.com/@'+p.tiktok.replace(/^@/,'')):null,
  p.website_url?socialLink('Website',p.website_url):null
 ].filter(Boolean);
 socials.append(...handles);if(handles.length)intro.append(socials);
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
 }finally{state.postLoading=false;}
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
})();
