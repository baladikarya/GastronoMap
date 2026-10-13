/* GastronoMap — Community: feed, stories, composition and conversations. */
(()=>{
'use strict';
const view=document.getElementById('communityView');
const body=view?.querySelector('.primary-view__body');
if(!body) return;
const ICONS={
  heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  comment:'M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 1 1 21 11.5Z',
  share:'M12 16V3m0 0L7 8m5-5 5 5M5 14v6h14v-6',
  bookmark:'M6 3h12v18l-6-4-6 4V3Z',
  plus:'M12 5v14M5 12h14',
  close:'M5 5l14 14M19 5 5 19',
  image:'M4 3h16a1 1 0 0 1 1 1v16H3V4a1 1 0 0 1 1-1ZM3 16l5-5 4 4 3-3 6 6M8 8h.01',
  pin:'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0ZM12 10h.01',
  chevron:'M9 18l6-6-6-6',
  send:'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z',
  back:'M15 18l-6-6 6-6',
  trash:'M4 7h16M10 3h4M6 7l1 14h10l1-14M10 11v6M14 11v6',
  arrow:'M5 12h14M13 6l6 6-6 6',
  refresh:'M20 11a8 8 0 1 0-2 5M20 4v7h-7'
};
const $=(tag,cls,text)=>{
  const element=document.createElement(tag);
  if(cls)element.className=cls;
  if(text!==undefined)element.textContent=text;
  return element;
};
function glyph(name,filled=false){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('aria-hidden','true');
  svg.setAttribute('class','community-icon');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',ICONS[name]||ICONS.arrow);
  path.setAttribute('fill',filled?'currentColor':'none');
  path.setAttribute('stroke','currentColor');
  path.setAttribute('stroke-width','1.8');
  path.setAttribute('stroke-linecap','round');
  path.setAttribute('stroke-linejoin','round');
  svg.append(path);
  return svg;
}
function button(text,cls,handler,iconName){
  const b=$('button',cls);
  b.type='button';
  if(iconName)b.append(glyph(iconName));
  if(text!==undefined&&text!==null)b.append($('span','',text));
  if(handler)b.addEventListener('click',handler);
  return b;
}
const prettyTime=new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric'});
const state={posts:[],filter:'latest',area:'',topic:'',gps:null,request:0,selectedPost:null,detailComments:[],commentLikes:new Set(),loading:false,deepLink:new URLSearchParams(location.search).get('post')};
const FEED_PAGE_SIZE=12,COMMENT_PAGE_SIZE=40,FEED_CACHE_MS=45000;
const COMMUNITY_TOPICS=[
  ['review','Ulasan'],['recommendation','Rekomendasi'],['hidden-gem','Hidden Gem'],
  ['street-food','Street Food'],['tips','Tips Kuliner'],['question','Tanya Jawab']
];
const topicName=id=>COMMUNITY_TOPICS.find(([key])=>key===id)?.[1]||null;
let lastLoadedAt=0,lastLoadedCriteria='',lastLoadedUser=null;
let feedOffset=0,feedHasMore=true,feedBusy=false,feedObserver=null,feedError=false,followingIds=null;
let commentOffset=0,commentHasMore=true,commentBusyLoading=false,commentRequest=0;
const pendingMutations=new Set();
const user=()=>typeof myUserId==='string'&&myUserId?myUserId:null;
const toast=message=>typeof showToast==='function'?showToast(message):console.info(message);
const requireAuth=()=>typeof requireLogin==='function'&&requireLogin();
function safeImage(url,cls,alt){
  if(typeof url!=='string'||!(/^(https:\/\/|blob:)/i).test(url))return null;
  const image=$('img',cls);
  image.src=url;image.alt=alt||'';image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';
  return image;
}
function avatar(profile){
  const image=safeImage(profile?.avatar_url,'community-avatar','Foto profil');
  if(image)return image;
  return $('span','community-avatar community-avatar--empty',displayName(profile).slice(0,1).toUpperCase());
}
function displayName(profile){
  // Community identities use only the public username, never email/display_name.
  const username=typeof profile?.username==='string'?profile.username.trim():'';
  return username&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)
    ? username
    : 'Pengguna GastronoMap';
}
function openAuthorProfile(id){
  // Own profile belongs to the Profile tab; dismiss Community detail first.
  if(id===user()&&openedModal?.classList.contains('community-detail'))closeDetail();
  window.openSocialProfile?.(id);
}
function distanceKm(a,b,c,d){
  const toRad=Math.PI/180, x=(c-a)*toRad, y=(d-b)*toRad;
  const h=Math.sin(x/2)**2+Math.cos(a*toRad)*Math.cos(c*toRad)*Math.sin(y/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
}
function modal(className,title){
  const surface=$('div','community-modal '+className);
  surface.hidden=true;surface.setAttribute('role','dialog');surface.setAttribute('aria-modal','true');surface.setAttribute('aria-label',title);
  const shade=$('div','community-modal-shade');
  const panel=$('section','community-modal-panel');
  surface.append(shade,panel);
  shade.onclick=()=>closeModal(surface);
  document.body.append(surface);
  return {surface,panel};
}
let openedModal=null,returnFocus=null;
function openModal(surface){
  if(openedModal&&openedModal!==surface)openedModal.hidden=true;
  returnFocus=document.activeElement;surface.hidden=false;openedModal=surface;
  document.body.classList.add('community-dialog-open');
  // Prevent keyboard focus from escaping the active Community dialog.
  const target=surface.querySelector('button:not([disabled]),textarea:not([disabled]),input:not([disabled])');
  target?.focus({preventScroll:true});
}
function closeModal(surface){
  surface.hidden=true;
  if(openedModal===surface){openedModal=null;document.body.classList.remove('community-dialog-open');}
  if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
}
document.addEventListener('keydown',e=>{
  if(!openedModal)return;
  if(e.key==='Escape'){
    if(openedModal===composer.surface)closeComposer();
    else closeDetail();
    return;
  }
  if(e.key!=='Tab')return;
  const focusable=[...openedModal.querySelectorAll('button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden]),textarea:not([disabled]):not([hidden]),[tabindex]:not([tabindex="-1"])')]
    .filter(el=>el.getClientRects().length>0);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(e.shiftKey&&(document.activeElement===first||!openedModal.contains(document.activeElement))){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&(document.activeElement===last||!openedModal.contains(document.activeElement))){e.preventDefault();first.focus();}
});
function status(message,action){
  feed.replaceChildren();
  feed.setAttribute('aria-busy',String(!action));
  if(!action){
    for(let i=0;i<3;i++){
      const shell=$('div','community-skeleton community-post');
      shell.setAttribute('aria-hidden','true');
      shell.append($('div','community-skeleton-line community-skeleton-line--short'),
        $('div','community-skeleton-line'),
        $('div','community-skeleton-image'),
        $('div','community-skeleton-line community-skeleton-line--short'));
      feed.append(shell);
    }
    return;
  }
  const wrapper=$('div','community-feed-state');
  wrapper.append($('div','community-feed-state-title',message));
  if(action)wrapper.append(button('Coba lagi','community-try',loadCommunityFeed,'refresh'));
  feed.append(wrapper);
}
/* Header and filters remain within the established Community page and bottom navigation. */
body.replaceChildren();
const intro=$('div','community-intro');
const introText=$('div','community-intro-text');
introText.append($('p','community-eyebrow','CERITA & REKOMENDASI'));
introText.append($('h2','','Rasa lebih seru, kalau dibagi.'));
introText.append($('p','community-intro-subtitle','Temukan pengalaman kuliner, tempat favorit, dan cerita dari pecinta makanan.'));
const createButton=button('Bagikan Cerita','community-create-button',openComposer,'plus');
intro.append(introText,createButton);
const filters=$('div','community-filters');
filters.setAttribute('role','group');filters.setAttribute('aria-label','Filter postingan');
const filterNames=[['latest','Terbaru'],['following','Following'],['popular','Populer'],['nearby','Di Sekitar']];
const filterButtons=new Map();
for(const [key,label] of filterNames){
  const b=button(label,'community-filter',()=>selectFilter(key));
  b.setAttribute('aria-pressed',key==='latest'?'true':'false');
  filterButtons.set(key,b);filters.append(b);
}
/* Stage 15: filters are server-backed, not restricted to loaded feed pages. */
const discovery=$('div','community-discovery');
const areaInput=$('input','community-discovery-area');
areaInput.type='search';areaInput.maxLength=80;areaInput.placeholder='Cari kota atau area…';
areaInput.autocomplete='off';areaInput.setAttribute('aria-label','Cari kota atau area postingan');
const areaApply=button('Cari Area','community-discovery-apply',applyArea,'pin');
areaInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();applyArea();}});
const topicSelect=$('select','community-discovery-topic');
topicSelect.setAttribute('aria-label','Filter topik postingan');
topicSelect.append($('option','','Semua topik'));topicSelect.firstChild.value='';
for(const [key,label] of COMMUNITY_TOPICS){const option=$('option','',label);option.value=key;topicSelect.append(option);}
topicSelect.addEventListener('change',()=>{state.topic=topicSelect.value;loadCommunityFeed(true);});
const clearDiscovery=button('Reset','community-discovery-reset',()=>{
  state.area='';state.topic='';areaInput.value='';topicSelect.value='';loadCommunityFeed(true);
});
const discoveryControls=$('div','community-discovery-controls');
discoveryControls.append(areaInput,areaApply,topicSelect,clearDiscovery);
const discoveryHint=$('p','community-discovery-hint');
discovery.append(discoveryControls,discoveryHint);
const feed=$('div','community-feed');
feed.id='communityFeed';
feed.setAttribute('aria-live','polite');
body.append(intro,filters,discovery,feed);
let locationSelection=0;
function criteriaKey(){
  return [state.filter,state.area,state.topic,state.filter==='nearby'?String(state.gps?.lat)+','+String(state.gps?.lng):''].join('|');
}
function applyArea(){
  const value=areaInput.value.trim().replace(/\s+/g,' ').slice(0,80);
  if(value===state.area)return;
  state.area=value;loadCommunityFeed(true);
}
function selectFilter(key){
  if(key==='following'&&!user()){
    toast('Login untuk melihat postingan akun yang Anda ikuti.');
    requireAuth();return;
  }
  const selection=++locationSelection;
  if(key==='nearby'&&!state.gps){
    if(!navigator.geolocation){toast('Lokasi perangkat tidak tersedia.');return;}
    toast('Meminta izin lokasi untuk menampilkan postingan terdekat.');
    navigator.geolocation.getCurrentPosition(
      pos=>{
        if(selection!==locationSelection)return;
        state.gps={lat:pos.coords.latitude,lng:pos.coords.longitude};
        state.filter=key;loadCommunityFeed(true);
      },
      ()=>{if(selection===locationSelection)toast('Lokasi tidak diizinkan atau gagal ditemukan.');},
      {enableHighAccuracy:false,maximumAge:300000,timeout:10000}
    );
    return;
  }
  if(state.filter===key)return;
  state.filter=key;loadCommunityFeed(true);
}
function filteredPosts(){return state.posts;}
function renderGallery(post,isDetail){
  if(!post.media.length)return null;
  const gallery=$('div','community-gallery '+(isDetail?'community-gallery--detail':'community-gallery--'+Math.min(4,post.media.length)));
  const showing=isDetail?post.media:post.media.slice(0,4);
  for(let index=0;index<showing.length;index++){
    const photo=showing[index];
    const item=$(!isDetail?'button':'div','community-gallery-item');
    if(!isDetail){
      item.type='button';
      item.setAttribute('aria-label','Buka foto '+(index+1)+' dari '+post.media.length);
      item.addEventListener('click',()=>openDetail(post.id));
    }
    const image=safeImage(isDetail?photo.url:(photo.thumbnail_url||photo.url),'community-gallery-image','Foto pengalaman kuliner '+(index+1));
    if(image&&photo.thumbnail_url&&!isDetail)image.addEventListener('error',()=>{if(image.src!==photo.url)image.src=photo.url;},{once:true});
    if(image)item.append(image);
    if(isDetail&&photo.id&&(post.user_id!==user()||isAdmin)){
      const photoMenu=button('•••','community-photo-menu',()=>window.GMModeration?.openActions({
        type:'post_photo',id:photo.id,ownerId:post.user_id,
        name:'Foto '+(index+1)+' dari postingan',
        onRefresh:()=>{if(openedModal===detail.surface)closeDetail();return loadCommunityFeed(true);}
      }));
      photoMenu.setAttribute('aria-label','Opsi foto '+(index+1));
      item.append(photoMenu);
    }
    if(!isDetail&&index===3&&post.media.length>4)item.append($('span','community-gallery-more','+'+(post.media.length-4)));
    gallery.append(item);
  }
  if(isDetail){
    const counter=$('div','community-gallery-count',post.media.length+' foto · Geser untuk melihat');
    const wrapper=$('div','community-gallery-wrap');wrapper.append(gallery,counter);return wrapper;
  }
  return gallery;
}
function renderPost(post,isDetail=false){
  const card=$('article','community-post'+(isDetail?' community-post--full':''));
  card.dataset.postId=post.id;
  const header=$('div','community-post-header');
  const author=button(null,'community-author',()=>openAuthorProfile(post.user_id));
  author.setAttribute('aria-label','Lihat profil '+displayName(post.profile));
  author.append(avatar(post.profile));
  const person=$('span','community-post-person');
  person.append($('strong','',displayName(post.profile)));
  person.append($('time','community-post-time',prettyTime.format(new Date(post.created_at))+(post.location_name?' · '+post.location_name:'')));
  author.append(person);header.append(author);
  const more=button('•••','community-more',()=>window.GMModeration?.openActions({
    type:'post',id:post.id,ownerId:post.user_id,name:'Postingan Community',
    status:post.moderation_state,
    onOwnerDelete:()=>deletePost(post),
    onRefresh:()=>{if(openedModal===detail.surface)closeDetail();return loadCommunityFeed(true);}
  }));
  more.setAttribute('aria-label','Opsi postingan');
  header.append(more);
  if(post.moderation_state==='hidden')header.append($('span','community-moderated-chip','Disembunyikan'));
  card.append(header);
  if(post.caption)card.append($('p','community-post-caption',post.caption));
  if(topicName(post.topic)||state.filter==='nearby'&&Number.isFinite(post.distance_km)){
    const metadata=$('div','community-post-metadata');
    if(topicName(post.topic)){
      const topic=button('#'+topicName(post.topic),'community-post-topic',()=>{
        state.topic=state.topic===post.topic?'':post.topic;
        topicSelect.value=state.topic;
        if(openedModal===detail.surface)closeDetail();
        loadCommunityFeed(true);
      });
      topic.setAttribute('aria-label','Filter topik '+topicName(post.topic));
      metadata.append(topic);
    }
    if(state.filter==='nearby'&&Number.isFinite(post.distance_km))
      metadata.append($('span','community-post-distance',post.distance_km.toLocaleString('id-ID',{maximumFractionDigits:1})+' km dari Anda'));
    card.append(metadata);
  }
  const gallery=renderGallery(post,isDetail);if(gallery)card.append(gallery);
  if(post.resto){
    const tag=button(null,'community-resto-tag',()=>{
      if(openedModal===detail.surface)closeDetail();
      navigatePrimaryView('home');openDetailRestaurant(post.resto_id);
    });
    const firstPhoto=post.media[0];
    const miniature=(firstPhoto&&safeImage(firstPhoto.thumbnail_url||firstPhoto.url,'community-resto-mini',''))||$('span','community-resto-mini community-resto-mini--empty');
    if(firstPhoto?.thumbnail_url&&miniature.tagName==='IMG')miniature.addEventListener('error',()=>{miniature.src=firstPhoto.url;},{once:true});
    const info=$('span','community-resto-info');
    info.append($('strong','',post.resto.name));
    info.append($('small','',post.resto.address||'Lihat detail restoran'));
    tag.append(miniature,info,glyph('chevron'));card.append(tag);
  }
  const actions=$('div','community-post-actions');
  const like=button(String(post.likeCount),'community-post-action'+(post.liked?' is-active':''),()=>toggleLike(post),'heart');
  like.setAttribute('aria-label',(post.liked?'Batal suka':'Suka')+' · '+post.likeCount);
  like.setAttribute('aria-pressed',String(post.liked));
  if(post.liked){like.firstChild.querySelector('path').setAttribute('fill','currentColor');}
  const comment=button(String(post.commentCount),'community-post-action',()=>openDetail(post.id),'comment');
  comment.setAttribute('aria-label','Lihat komentar · '+post.commentCount);
  const share=button('Bagikan','community-post-action',()=>sharePost(post),'share');
  const saved=button(null,'community-post-action community-post-save'+(post.saved?' is-active':''),()=>toggleSave(post),'bookmark');
  saved.setAttribute('aria-label',post.saved?'Hapus dari simpanan':'Simpan postingan');
  saved.setAttribute('aria-pressed',String(post.saved));
  if(post.saved)saved.firstChild.querySelector('path').setAttribute('fill','currentColor');
  actions.append(like,comment,share,saved);
  card.append(actions);
  return card;
}
function stopFeedObserver(){
  if(feedObserver){feedObserver.disconnect();feedObserver=null;}
}
function makeLoadMore(){
  const more=button(feedError?'Gagal memuat. Coba lagi':'Muat cerita berikutnya','community-try',loadNextFeed,'refresh');
  more.setAttribute('aria-label','Muat postingan Community berikutnya');
  if(!feedError&&'IntersectionObserver' in window){
    feedObserver=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)&&!feedBusy){
        stopFeedObserver();loadNextFeed();
      }
    },{rootMargin:'240px 0px'});
    feedObserver.observe(more);
  }
  return more;
}
function renderFeed(){
  stopFeedObserver();
  feed.setAttribute('aria-busy',String(feedBusy));
  for(const [key,btn] of filterButtons){
    const active=key===state.filter;btn.classList.toggle('is-active',active);btn.setAttribute('aria-pressed',String(active));
  }
  clearDiscovery.hidden=!state.area&&!state.topic;
  discoveryHint.textContent=state.filter==='nearby'
    ?'Menampilkan cerita dengan restoran tertandai dalam radius 25 km. Lokasi perangkat tidak disimpan.'
    :state.filter==='popular'
      ?'Peringkat interaksi (like dan komentar) untuk cerita 30 hari terakhir. Saat konten masih sedikit, hasil belum mewakili tren.'
      :'Filter kota/area mencocokkan lokasi postingan dan alamat restoran yang ditandai.';
  const posts=filteredPosts();
  feed.replaceChildren(...posts.map(p=>renderPost(p)));
  if(!posts.length){
    const empty=$('div','community-feed-empty-note');
    empty.append($('p','',state.filter==='following'
      ? 'Belum ada cerita dari akun yang Anda ikuti.'
      : state.filter==='nearby'?'Belum ada cerita dengan restoran tertandai dalam radius 25 km.'
      : state.filter==='popular'?'Belum ada cerita dalam 30 hari terakhir.'
      :state.area||state.topic?'Belum ada cerita yang cocok. Coba ubah kota/area atau topik.'
      : 'Belum ada cerita. Jadilah yang pertama berbagi!'));
    feed.append(empty);
  }
  if(feedHasMore&&!feedBusy)feed.append(makeLoadMore());
}
function refreshPost(post){
  const previous=[...feed.querySelectorAll('.community-post[data-post-id]')].find(card=>card.dataset.postId===post.id);
  if(previous)previous.replaceWith(renderPost(post));
  if(openedModal===detail.surface&&state.selectedPost?.id===post.id)renderDetailPost(post);
}
function openDetailRestaurant(id){
  if(typeof window.openDetail==='function')window.openDetail(id);
}
function safeResult(result){if(result.error)throw result.error;return result.data||[];}
async function fetchCommunityProfiles(ids){
  const result=await sb.from('public_social_profiles').select('id,username,avatar_url').in('id',ids);
  // During staged rollout, the legacy Community view remains usable until
  // the additive database migration is applied.
  if(result.error&&['PGRST205','42P01'].includes(result.error.code))
    return sb.from('profiles').select('id,username,avatar_url').in('id',ids);
  return result;
}
async function hydrateFeedBatch(posts,ticket){
  if(!posts.length)return [];
  const ids=posts.map(p=>p.id),users=[...new Set(posts.map(p=>p.user_id))];
  const restos=[...new Set(posts.map(p=>p.resto_id).filter(Boolean))];
  let mediaRequest=await sb.from('post_media').select('id,post_id,url,thumbnail_url,position,moderation_state')
    .in('post_id',ids).order('position',{ascending:true});
  // Backwards compatible while the thumbnail column migration is being applied.
  if(mediaRequest.error&&['42703','PGRST204'].includes(mediaRequest.error.code)){
    mediaRequest=await sb.from('post_media').select('id,post_id,url,position,moderation_state')
      .in('post_id',ids).order('position',{ascending:true});
  }
  const results=await Promise.all([
    Promise.resolve(mediaRequest),
    sb.from('post_likes').select('post_id,user_id').in('post_id',ids),
    sb.from('comments').select('post_id').in('post_id',ids),
    fetchCommunityProfiles(users),
    restos.length?sb.from('restos').select('id,name,address,lat,lng').in('id',restos):Promise.resolve({data:[]}),
    user()?sb.from('post_saves').select('post_id').eq('user_id',user()).in('post_id',ids):Promise.resolve({data:[]})
  ]);
  if(ticket!==state.request)return [];
  const [mediaRows,likeRows,commentRows,profileRows,restoRows,saveRows]=results.map(safeResult);
  const mediaBy=new Map(),likesBy=new Map(),commentsBy=new Map();
  for(const m of mediaRows){if(!mediaBy.has(m.post_id))mediaBy.set(m.post_id,[]);mediaBy.get(m.post_id).push(m);}
  for(const l of likeRows){if(!likesBy.has(l.post_id))likesBy.set(l.post_id,[]);likesBy.get(l.post_id).push(l.user_id);}
  for(const c of commentRows)commentsBy.set(c.post_id,(commentsBy.get(c.post_id)||0)+1);
  const profiles=new Map(profileRows.map(p=>[p.id,p])),restoMap=new Map(restoRows.map(r=>[r.id,r])),saved=new Set(saveRows.map(p=>p.post_id));
  return posts.map(p=>({
    ...p,media:mediaBy.get(p.id)||[],profile:profiles.get(p.user_id)||null,
    resto:restoMap.get(p.resto_id)||null,likeCount:(likesBy.get(p.id)||[]).length,
    liked:(likesBy.get(p.id)||[]).includes(user()),commentCount:commentsBy.get(p.id)||0,saved:saved.has(p.id)
  }));
}
async function loadNextFeed(){
  if(feedBusy||!feedHasMore)return;
  const ticket=state.request;
  feedBusy=true;feedError=false;stopFeedObserver();feed.setAttribute('aria-busy','true');
  try{
    const serverDiscovery=state.filter==='popular'||state.filter==='nearby'||Boolean(state.area)||Boolean(state.topic);
    let fetched=[];
    if(serverDiscovery){
      const response=await sb.rpc('gm_community_discover',{
        p_mode:state.filter,p_area:state.area||null,p_topic:state.topic||null,
        p_lat:state.filter==='nearby'?state.gps?.lat:null,
        p_lng:state.filter==='nearby'?state.gps?.lng:null,
        p_limit:FEED_PAGE_SIZE+1,p_offset:feedOffset
      });
      if(response.error)throw response.error;
      fetched=safeResult(response);
    }else{
      if(state.filter==='following'&&followingIds===null){
        const links=safeResult(await sb.from('user_follows').select('following_id').eq('follower_id',user()).limit(1000));
        if(ticket!==state.request)return;
        followingIds=links.map(link=>link.following_id);
      }
      if(state.filter==='following'&&!followingIds?.length){
        feedHasMore=false;renderFeed();return;
      }
      const makeQuery=withTopic=>{
        let query=sb.from('posts').select('id,user_id,resto_id,caption,location_name,created_at,moderation_state'+(withTopic?',topic':''));
        if(state.filter==='following')query=query.in('user_id',followingIds);
        return query.order('created_at',{ascending:false}).order('id',{ascending:false})
          .range(feedOffset,feedOffset+FEED_PAGE_SIZE);
      };
      let response=await makeQuery(true);
      if(response.error&&['42703','PGRST204'].includes(response.error.code))response=await makeQuery(false);
      fetched=safeResult(response);
    }
    if(ticket!==state.request)return;
    const batch=fetched.slice(0,FEED_PAGE_SIZE);
    const hydrated=await hydrateFeedBatch(batch,ticket);
    if(ticket!==state.request)return;
    feedOffset+=batch.length;
    feedHasMore=fetched.length>FEED_PAGE_SIZE;
    const seen=new Set(state.posts.map(p=>p.id));
    state.posts.push(...hydrated.filter(p=>!seen.has(p.id)));
    // Deep links work for posts beyond the first feed page without loading every page.
    if(state.deepLink&&/^[0-9a-f-]{36}$/i.test(state.deepLink)&&!state.posts.some(p=>p.id===state.deepLink)){
      let response=await sb.from('posts').select('id,user_id,resto_id,caption,location_name,created_at,moderation_state,topic')
        .eq('id',state.deepLink).maybeSingle();
      if(response.error&&['42703','PGRST204'].includes(response.error.code))
        response=await sb.from('posts').select('id,user_id,resto_id,caption,location_name,created_at,moderation_state')
          .eq('id',state.deepLink).maybeSingle();
      if(ticket!==state.request)return;
      if(!response.error&&response.data){
        const extra=await hydrateFeedBatch([response.data],ticket);
        if(ticket!==state.request)return;
        state.posts.push(...extra);
      }
    }
    lastLoadedAt=Date.now();lastLoadedCriteria=criteriaKey();lastLoadedUser=user();
    if(state.deepLink){
      const target=state.deepLink;state.deepLink=null;
      renderFeed();if(state.posts.some(p=>p.id===target))openDetail(target);
    }else renderFeed();
  }catch(err){
    if(ticket!==state.request)return;
    console.error('Community feed:',err);feedError=true;
    if(!state.posts.length)status(
      ['PGRST202','42883'].includes(err?.code)
        ?'Fitur discovery belum diaktifkan pada database. Terapkan migrasi P3 Tahap 15 terlebih dahulu.'
        :'Cerita belum bisa dimuat. Periksa koneksi lalu coba lagi.',true);
    else{renderFeed();}
  }finally{
    if(ticket===state.request){feedBusy=false;feed.setAttribute('aria-busy','false');
      if(!feedError)renderFeed();
    }
  }
}
async function loadCommunityFeed(force=false){
  if(!force&&state.posts.length&&lastLoadedCriteria===criteriaKey()&&lastLoadedUser===user()&&Date.now()-lastLoadedAt<FEED_CACHE_MS&&!state.deepLink){
    renderFeed();return;
  }
  ++state.request;
  followingIds=null;feedOffset=0;feedHasMore=true;feedBusy=false;feedError=false;
  state.posts=[];state.loading=true;stopFeedObserver();
  status('Menyiapkan cerita kuliner…');
  try{await loadNextFeed();}
  finally{state.loading=false;}
}
async function toggleLike(post){
  if(!requireAuth())return;
  const key='post-like:'+post.id;
  if(pendingMutations.has(key))return;
  pendingMutations.add(key);
  const previous=post.liked;post.liked=!previous;post.likeCount+=previous?-1:1;refreshPost(post);
  try{
    const result=previous
      ?await sb.from('post_likes').delete().eq('post_id',post.id).eq('user_id',user())
      :await sb.from('post_likes').insert({post_id:post.id,user_id:user()});
    if(result.error)throw result.error;
  }catch(error){
    console.error(error);post.liked=previous;post.likeCount+=previous?1:-1;refreshPost(post);
    toast('Gagal memperbarui suka. Perubahan dibatalkan.');
  }finally{pendingMutations.delete(key);}
}
async function toggleSave(post){
  if(!requireAuth())return;
  const key='post-save:'+post.id;
  if(pendingMutations.has(key))return;
  pendingMutations.add(key);
  const previous=post.saved;post.saved=!previous;refreshPost(post);
  try{
    const result=previous
      ?await sb.from('post_saves').delete().eq('post_id',post.id).eq('user_id',user())
      :await sb.from('post_saves').insert({post_id:post.id,user_id:user()});
    if(result.error)throw result.error;
    toast(post.saved?'Postingan disimpan.':'Postingan dihapus dari simpanan.');
  }catch(error){
    console.error(error);post.saved=previous;refreshPost(post);
    toast('Gagal menyimpan postingan. Perubahan dibatalkan.');
  }finally{pendingMutations.delete(key);}
}
async function sharePost(post){
  const url=new URL(location.href);
  url.searchParams.set('post',post.id);
  url.hash='';
  const message='Cerita kuliner di GastronoMap';
  try{
    if(navigator.share){await navigator.share({title:message,text:(post.caption||'').slice(0,160)||undefined,url:url.href});return;}
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url.href);toast('Tautan postingan disalin.');return;}
    window.prompt('Salin tautan postingan',url.href);
  }catch(err){if(err?.name!=='AbortError')toast('Tidak dapat membagikan postingan.');}
}
/* Composer — separate from the central Add Resto action. */
const composer=modal('community-composer','Buat postingan Community');
const composerHeader=$('header','community-modal-header');
const composerClose=button(null,'community-icon-button',closeComposer,'close');composerClose.setAttribute('aria-label','Tutup');
const publishButton=button('Posting','community-publish',publish);
composerHeader.append(composerClose,$('h2','','Buat Postingan'),publishButton);
const composeContent=$('div','community-compose-content');
const composeIdentity=$('div','community-compose-identity');
const composeAvatar=$('span','community-avatar community-avatar--empty','P');
const composeBy=$('div','community-compose-by');
composeBy.append($('strong','','Pengguna GastronoMap'),$('span','','Publik · Dapat dilihat semua pengguna'));
composeIdentity.append(composeAvatar,composeBy);
const caption=$('textarea','community-compose-caption');
caption.placeholder='Ceritakan pengalaman kulinermu…';caption.maxLength=5000;caption.rows=5;
caption.setAttribute('aria-label','Cerita pengalaman kuliner');
const charCount=$('div','community-char-count','0 / 5000');
const thumbnails=$('div','community-photos');
const photoInput=$('input','community-file-input');
photoInput.type='file';photoInput.accept='image/jpeg,image/png,image/webp';photoInput.multiple=true;photoInput.hidden=true;
const addPhotoButton=button('Tambah foto (maks. 5)','community-photo-add',()=>photoInput.click(),'image');
const fields=$('div','community-compose-fields');
const topicLabel=$('label','community-field-label','Topik cerita (opsional)');
const topicInput=$('select','community-field-input');
topicInput.setAttribute('aria-label','Topik cerita');
topicInput.append($('option','','Pilih topik'));topicInput.firstChild.value='';
for(const [key,label] of COMMUNITY_TOPICS){const option=$('option','',label);option.value=key;topicInput.append(option);}
const locationLabel=$('label','community-field-label','Lokasi (opsional)');
const locationInput=$('input','community-field-input');locationInput.placeholder='Contoh: Bandung, Jawa Barat';locationInput.maxLength=120;
const restoLabel=$('label','community-field-label','Tandai restoran (opsional)');
const restoInput=$('input','community-field-input');restoInput.placeholder='Cari restoran di GastronoMap…';restoInput.autocomplete='off';
const restoResults=$('div','community-resto-results');
const chosenResto=$('div','community-chosen-resto');chosenResto.hidden=true;
fields.append(topicLabel,topicInput,locationLabel,locationInput,restoLabel,restoInput,chosenResto,restoResults);
composeContent.append(composeIdentity,caption,charCount,thumbnails,addPhotoButton,photoInput,fields);
composer.panel.append(composerHeader,composeContent);
let photoFiles=[],taggedResto=null,uploadBusy=false,searchTimer=null,searchSequence=0;
function clearPhotos(){
  for(const p of photoFiles)URL.revokeObjectURL(p.preview);
  photoFiles=[];renderPhotos();
}
composer.surface.querySelector('.community-modal-shade').onclick=closeComposer;
function closeComposer(){
  if(uploadBusy)return;
  closeModal(composer.surface);clearPhotos();caption.value='';topicInput.value='';locationInput.value='';restoInput.value='';
  taggedResto=null;chosenResto.hidden=true;restoResults.replaceChildren();updateComposerState();
}
function openComposer(){
  if(!requireAuth())return;
  if(window.gmSuspensionState?.active){
    const until=window.gmSuspensionState.until
      ?' sampai '+new Date(window.gmSuspensionState.until).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'})
      :'';
    toast('Akun dibatasi dari kontribusi'+until+'. Hubungi admin melalui Reports.');return;
  }
  const username=displayName({username:myUsername});
  composeBy.firstChild.textContent=username;
  composeAvatar.textContent=username.slice(0,1).toUpperCase();
  openModal(composer.surface);caption.focus();
}
function updateComposerState(){
  charCount.textContent=caption.value.length+' / 5000';
  publishButton.disabled=uploadBusy||(!caption.value.trim()&&!photoFiles.length);
  publishButton.lastChild.textContent=uploadBusy?'Mengirim…':'Posting';
}
caption.addEventListener('input',updateComposerState);
function renderPhotos(){
  thumbnails.replaceChildren();
  for(let i=0;i<photoFiles.length;i++){
    const item=photoFiles[i],tile=$('div','community-photo-tile');
    const preview=safeImage(item.preview,'community-photo-preview','Pratinjau foto '+(i+1));
    // Local blob URLs are safe for local previews; never use them for remote feed content.
    const img=preview||$('img','community-photo-preview');
    img.src=item.preview;img.alt='Pratinjau foto '+(i+1);
    const tools=$('div','community-photo-tools');
    const moveLeft=button(null,'community-photo-tool',()=>movePhoto(i,-1),'back');
    moveLeft.setAttribute('aria-label','Geser foto ke kiri');moveLeft.disabled=i===0;
    const moveRight=button(null,'community-photo-tool',()=>movePhoto(i,1),'chevron');
    moveRight.setAttribute('aria-label','Geser foto ke kanan');moveRight.disabled=i===photoFiles.length-1;
    const remove=button(null,'community-photo-tool',()=>{URL.revokeObjectURL(item.preview);photoFiles.splice(i,1);renderPhotos();},'close');
    remove.setAttribute('aria-label','Hapus foto');tools.append(moveLeft,moveRight,remove);
    tile.append(img,tools);thumbnails.append(tile);
  }
  addPhotoButton.hidden=photoFiles.length>=5;
  updateComposerState();
}
function movePhoto(i,by){
  const other=i+by;if(other<0||other>=photoFiles.length)return;
  [photoFiles[i],photoFiles[other]]=[photoFiles[other],photoFiles[i]];renderPhotos();
}
photoInput.addEventListener('change',()=>{
  const files=[...photoInput.files];photoInput.value='';
  for(const file of files){
    if(photoFiles.length>=5){toast('Maksimal 5 foto per postingan.');break;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>6291456){
      toast('Gunakan JPG, PNG, atau WebP berukuran maksimal 6 MB.');continue;
    }
    photoFiles.push({file,preview:URL.createObjectURL(file)});
  }
  renderPhotos();
});
function showChosenResto(){
  chosenResto.replaceChildren();
  if(!taggedResto){chosenResto.hidden=true;return;}
  chosenResto.hidden=false;
  chosenResto.append($('span','',taggedResto.name),button('Hapus','community-small-link',()=>{taggedResto=null;showChosenResto();}));
}
restoInput.addEventListener('input',()=>{
  taggedResto=null;showChosenResto();clearTimeout(searchTimer);
  const typed=restoInput.value.trim();if(typed.length<2){restoResults.replaceChildren();return;}
  const ticket=++searchSequence;
  searchTimer=setTimeout(async()=>{
    const result=await sb.from('restos').select('id,name,address').ilike('name','%'+typed.replace(/[%_\\]/g,'')+'%').limit(8);
    if(ticket!==searchSequence)return;
    restoResults.replaceChildren();
    if(result.error)return;
    for(const r of result.data||[]){
      const pick=button(null,'community-resto-option',()=>{
        taggedResto=r;restoInput.value='';restoResults.replaceChildren();showChosenResto();
      });
      pick.append($('strong','',r.name),$('small','',r.address||''));restoResults.append(pick);
    }
  },250);
});
async function publish(){
  if(uploadBusy||!requireAuth())return;
  const text=caption.value.trim();
  if(!text&&!photoFiles.length){toast('Tambahkan cerita atau foto terlebih dahulu.');return;}
  uploadBusy=true;updateComposerState();
  let createdPost=null;const uploaded=[];
  try{
    const newPost={
      user_id:user(),caption:text,location_name:locationInput.value.trim()||null,
      resto_id:taggedResto?.id||null
    };
    if(topicInput.value)newPost.topic=topicInput.value;
    const inserted=await sb.from('posts').insert(newPost).select('id').single();
    if(inserted.error)throw inserted.error;
    createdPost=inserted.data.id;
    const media=[];
    for(let i=0;i<photoFiles.length;i++){
      const file=photoFiles[i].file;
      const random=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+i;
      const path=user()+'/'+createdPost+'/'+random+'.jpg';
      const thumbnailPath=user()+'/'+createdPost+'/thumb-'+random+'.jpg';
      // Original is bounded to 1600px; feed uses a separate small, cached thumbnail.
      const optimized=await compressImage(file,1600,0.78);
      const thumbnail=await compressImage(file,480,0.72);
      const store=sb.storage.from('community-posts');
      const upload=await store.upload(path,optimized,{contentType:'image/jpeg',upsert:false,cacheControl:'31536000'});
      if(upload.error)throw upload.error;
      uploaded.push(path);
      const thumbUpload=await store.upload(thumbnailPath,thumbnail,{contentType:'image/jpeg',upsert:false,cacheControl:'31536000'});
      if(thumbUpload.error)throw thumbUpload.error;
      uploaded.push(thumbnailPath);
      media.push({post_id:createdPost,position:i,url:store.getPublicUrl(path).data.publicUrl,thumbnail_url:store.getPublicUrl(thumbnailPath).data.publicUrl});
    }
    if(media.length){
      let written=await sb.from('post_media').insert(media);
      if(written.error&&['42703','PGRST204'].includes(written.error.code)){
        written=await sb.from('post_media').insert(media.map(({thumbnail_url,...entry})=>entry));
      }
      if(written.error)throw written.error;
    }
    uploadBusy=false;closeComposer();
    state.filter='latest';state.area='';state.topic='';areaInput.value='';topicSelect.value='';
    toast('Cerita berhasil diposting.');await loadCommunityFeed(true);
    view.scrollTo({top:0,behavior:'smooth'});
  }catch(error){
    console.error('Gagal membuat postingan:',error);
    if(createdPost){await sb.from('posts').delete().eq('id',createdPost);}
    if(uploaded.length){await sb.storage.from('community-posts').remove(uploaded);}
    const explanation=String(error?.message||'');
    toast(/Terlalu sering|dibatasi|rate limit/i.test(explanation)?explanation:'Postingan gagal dikirim. Coba lagi.');
  }finally{uploadBusy=false;updateComposerState();}
}
updateComposerState();
/* Detail and threaded comments. */
const detail=modal('community-detail','Detail postingan dan komentar');
const detailHeader=$('header','community-modal-header');
const detailBack=button(null,'community-icon-button',closeDetail,'back');
detailBack.setAttribute('aria-label','Kembali ke Community');
detailHeader.append(detailBack,$('h2','','Postingan'),$('span','community-modal-header-space'));
const detailScroll=$('div','community-detail-scroll');
const detailPost=$('div','community-detail-post');
const commentsTitle=$('h3','community-comments-title','Komentar');
const commentsBody=$('div','community-comments');
detailScroll.append(detailPost,commentsTitle,commentsBody);
const commentForm=$('form','community-comment-form');
const replyLabel=$('div','community-reply-label');replyLabel.hidden=true;
const commentRow=$('div','community-comment-row');
const commentInput=$('textarea','community-comment-input');
commentInput.rows=1;commentInput.maxLength=2000;commentInput.placeholder='Tulis komentar…';
commentInput.setAttribute('aria-label','Tulis komentar');
const sendButton=button(null,'community-comment-send',null,'send');sendButton.type='submit';sendButton.setAttribute('aria-label','Kirim komentar');
commentRow.append(commentInput,sendButton);commentForm.append(replyLabel,commentRow);
detail.panel.append(detailHeader,detailScroll,commentForm);
let replyTo=null,commentBusy=false;
const expandedReplies=new Set();
detail.surface.querySelector('.community-modal-shade').onclick=closeDetail;
function closeDetail(){
  const returnToRewards=!!history.state?.gmRewardDetail;
  ++commentRequest;commentBusyLoading=false;closeModal(detail.surface);state.selectedPost=null;replyTo=null;expandedReplies.clear();
  if(returnToRewards){history.back();return;}
  const address=new URL(location.href);
  if(address.searchParams.has('post')){address.searchParams.delete('post');history.replaceState(history.state,'',address.href);}
}
function renderDetailPost(post){
  detailPost.replaceChildren(renderPost(post,true));
  commentsTitle.textContent='Komentar · '+post.commentCount;
}
function setReply(comment){
  replyTo=comment;
  replyLabel.hidden=false;replyLabel.replaceChildren();
  replyLabel.append($('span','','Membalas '+displayName(comment.profile)),button('Batal','community-small-link',()=>{replyTo=null;replyLabel.hidden=true;}));
  commentInput.focus();
}
function commentItem(c,depth=0){
  const wrap=$('div','community-comment'+(depth>0?' community-comment--reply':'')+(c.pending?' is-pending':''));
  const commentAvatar=button(null,'community-comment-author-avatar',()=>openAuthorProfile(c.user_id));
  commentAvatar.setAttribute('aria-label','Lihat profil '+displayName(c.profile));
  commentAvatar.append(avatar(c.profile));wrap.append(commentAvatar);
  const content=$('div','community-comment-content');
  const heading=$('div','community-comment-heading');
  heading.append(button(displayName(c.profile),'community-comment-author-name',()=>openAuthorProfile(c.user_id)),$('time','',prettyTime.format(new Date(c.created_at))));
  content.append(heading,$('p','',c.body));
  const bar=$('div','community-comment-tools');
  const like=button(String(c.likeCount),'community-comment-like'+(c.liked?' is-active':''),()=>toggleCommentLike(c),'heart');
  like.setAttribute('aria-label',c.liked?'Batal suka komentar':'Suka komentar');
  like.setAttribute('aria-pressed',String(c.liked));
  if(c.liked)like.firstChild.querySelector('path').setAttribute('fill','currentColor');
  if(c.pending)like.disabled=true;
  bar.append(like,button('Balas','community-small-link',()=>setReply(c)));
  const more=button('•••','community-comment-more',()=>window.GMModeration?.openActions({
    type:'comment',id:c.id,ownerId:c.user_id,name:'Komentar Community',
    onOwnerDelete:()=>deleteComment(c),
    onRefresh:()=>loadComments(c.post_id)
  }));
  more.setAttribute('aria-label','Opsi komentar');if(c.pending)more.disabled=true;
  bar.append(more);
  if(c.moderation_state==='hidden')content.append($('span','community-moderated-chip','Disembunyikan'));
  content.append(bar);wrap.append(content);
  const container=$('div','community-comment-thread');container.append(wrap);
  return container;
}
function renderComments(){
  commentsBody.replaceChildren();
  const list=state.detailComments;
  if(!list.length){commentsBody.append($('div','community-comments-empty','Belum ada komentar. Mulai percakapan pertama.'));if(!commentHasMore)return;}
  const byParent=new Map(),seen=new Set(),ids=new Set(list.map(c=>c.id));
  for(const c of list){
    const parent=c.parent_id&&ids.has(c.parent_id)?c.parent_id:null;
    if(!byParent.has(parent))byParent.set(parent,[]);
    byParent.get(parent).push(c);
  }
  function append(c,parent,depth){
    if(seen.has(c.id))return;
    seen.add(c.id);
    const item=commentItem(c,depth);
    parent.append(item);
    const children=byParent.get(c.id)||[];
    if(children.length){
      const isOpen=expandedReplies.has(c.id);
      const toggle=button(
        isOpen?'Sembunyikan balasan':'Lihat balasan ('+children.length+')',
        'community-replies-toggle'+(isOpen?' is-open':''),
        ()=>{if(expandedReplies.has(c.id))expandedReplies.delete(c.id);else expandedReplies.add(c.id);renderComments();},
        'chevron'
      );
      toggle.setAttribute('aria-expanded',String(isOpen));
      const thread=$('div','community-comment-children');
      thread.hidden=!isOpen;
      const content=item.querySelector('.community-comment-content');
      content.append(toggle);
      item.append(thread);
      // Mark hidden descendants visited to avoid duplicating them as roots.
      function markDescendants(id){
        for(const child of byParent.get(id)||[]){
          if(seen.has(child.id))continue;
          seen.add(child.id);
          markDescendants(child.id);
        }
      }
      if(isOpen){for(const child of children)append(child,thread,depth+1);}
      else markDescendants(c.id);
    }
  }
  for(const c of byParent.get(null)||[])append(c,commentsBody,0);
  // Guard against malformed cyclic relationships without duplicating comments.
  for(const c of list)if(!seen.has(c.id))append(c,commentsBody,0);
  if(commentHasMore&&!commentBusyLoading){
    const more=button('Muat komentar berikutnya','community-try',()=>loadComments(state.selectedPost?.id,true),'refresh');
    more.setAttribute('aria-label','Muat komentar berikutnya');commentsBody.append(more);
  }
}
async function loadComments(postId,append=false){
  if(!postId||commentBusyLoading)return;
  if(!append){
    ++commentRequest;commentOffset=0;commentHasMore=true;state.detailComments=[];
    commentsBody.replaceChildren($('div','community-comments-skeleton','Memuat komentar…'));
  }else if(!commentHasMore)return;
  const ticket=commentRequest;
  commentBusyLoading=true;commentsBody.setAttribute('aria-busy','true');
  try{
    const response=await sb.from('comments')
      .select('id,post_id,user_id,parent_id,body,created_at,moderation_state')
      .eq('post_id',postId).order('created_at',{ascending:true}).order('id',{ascending:true})
      .range(commentOffset,commentOffset+COMMENT_PAGE_SIZE);
    const fetched=safeResult(response),comments=fetched.slice(0,COMMENT_PAGE_SIZE);
    if(ticket!==commentRequest||state.selectedPost?.id!==postId)return;
    const users=[...new Set(comments.map(c=>c.user_id))];
    const results=await Promise.all([
      users.length?fetchCommunityProfiles(users):Promise.resolve({data:[]}),
      comments.length?sb.from('comment_likes').select('comment_id,user_id').in('comment_id',comments.map(c=>c.id)):Promise.resolve({data:[]})
    ]);
    if(ticket!==commentRequest||state.selectedPost?.id!==postId)return;
    const [profiles,likes]=results.map(safeResult),byId=new Map(profiles.map(p=>[p.id,p]));
    const counts=new Map(),mine=new Set();
    for(const like of likes){counts.set(like.comment_id,(counts.get(like.comment_id)||0)+1);if(like.user_id===user())mine.add(like.comment_id);}
    const known=new Set(state.detailComments.map(c=>c.id));
    state.detailComments.push(...comments.filter(c=>!known.has(c.id)).map(c=>({...c,profile:byId.get(c.user_id),likeCount:counts.get(c.id)||0,liked:mine.has(c.id)})));
    commentOffset+=comments.length;commentHasMore=fetched.length>COMMENT_PAGE_SIZE;
  }catch(error){
    if(ticket!==commentRequest)return;
    console.error(error);
    if(!append)commentsBody.replaceChildren($('div','community-comments-empty','Komentar belum dapat dimuat.'));
    const retry=button('Coba lagi memuat komentar','community-try',()=>loadComments(postId,append),'refresh');
    commentsBody.append(retry);return;
  }finally{
    if(ticket===commentRequest){commentBusyLoading=false;commentsBody.setAttribute('aria-busy','false');}
  }
  if(ticket===commentRequest)renderComments();
}
async function deleteComment(comment){
  const post=state.selectedPost;
  if(!post||comment.post_id!==post.id||comment.user_id!==user())return;
  if(!window.confirm('Hapus komentar Anda? Balasan pengguna lain akan tetap tersimpan.'))return;
  if(!requireAuth())return;
  try{
    const response=await sb.from('comments').delete()
      .eq('id',comment.id).eq('post_id',post.id).eq('user_id',user())
      .select('id');
    if(response.error)throw response.error;
    if(!response.data?.length)throw new Error('Komentar tidak ditemukan atau tidak dapat dihapus');
    if(replyTo?.id===comment.id){
      replyTo=null;replyLabel.hidden=true;replyLabel.replaceChildren();
    }
    post.commentCount=Math.max(0,post.commentCount-1);
    renderFeed();renderDetailPost(post);
    await loadComments(post.id);
    toast('Komentar berhasil dihapus.');
  }catch(error){
    console.error('Gagal menghapus komentar:',error);
    toast('Komentar gagal dihapus. Silakan coba lagi.');
  }
}
async function toggleCommentLike(comment){
  if(!requireAuth()||comment.pending)return;
  const key='comment-like:'+comment.id;if(pendingMutations.has(key))return;
  pendingMutations.add(key);
  const previous=comment.liked;
  comment.liked=!previous;comment.likeCount+=previous?-1:1;renderComments();
  try{
    const result=previous
      ?await sb.from('comment_likes').delete().eq('comment_id',comment.id).eq('user_id',user())
      :await sb.from('comment_likes').insert({comment_id:comment.id,user_id:user()});
    if(result.error)throw result.error;
  }catch(error){
    console.error(error);comment.liked=previous;comment.likeCount+=previous?1:-1;renderComments();
    toast('Gagal memperbarui suka komentar. Perubahan dibatalkan.');
  }finally{pendingMutations.delete(key);}
}
function openDetail(postId){
  const post=state.posts.find(p=>p.id===postId);
  if(!post)return;
  state.selectedPost=post;replyTo=null;replyLabel.hidden=true;commentInput.value='';expandedReplies.clear();
  renderDetailPost(post);detailScroll.scrollTop=0;openModal(detail.surface);
  detailBack.focus({preventScroll:true});loadComments(postId);
}
commentForm.addEventListener('submit',async e=>{
  e.preventDefault();
  if(commentBusy||!state.selectedPost||!requireAuth())return;
  const post=state.selectedPost,comment=commentInput.value.trim();
  if(!comment)return;
  if(replyTo&&(replyTo.post_id!==post.id||!state.detailComments.some(c=>c.id===replyTo.id))){
    toast('Komentar yang dibalas tidak tersedia lagi.');replyTo=null;replyLabel.hidden=true;return;
  }
  commentBusy=true;sendButton.disabled=true;
  const parentId=replyTo?.id||null;
  const pending={id:'pending-'+Date.now(),post_id:post.id,user_id:user(),parent_id:parentId,body:comment,
    created_at:new Date().toISOString(),profile:{username:myUsername,avatar_url:myAvatarUrl},likeCount:0,liked:false,pending:true};
  if(parentId){
    expandedReplies.add(parentId);
    let ancestor=state.detailComments.find(c=>c.id===parentId);
    const visited=new Set();
    while(ancestor?.parent_id&&!visited.has(ancestor.parent_id)){
      visited.add(ancestor.parent_id);expandedReplies.add(ancestor.parent_id);
      ancestor=state.detailComments.find(c=>c.id===ancestor.parent_id);
    }
  }
  state.detailComments.push(pending);post.commentCount++;replyTo=null;replyLabel.hidden=true;commentInput.value='';
  renderComments();refreshPost(post);
  try{
    const result=await sb.from('comments')
      .insert({post_id:post.id,user_id:user(),parent_id:parentId,body:comment})
      .select('id,post_id,user_id,parent_id,body,created_at,moderation_state').single();
    if(result.error)throw result.error;
    if(state.selectedPost?.id===post.id){
      Object.assign(pending,result.data,{pending:false});
      renderComments();detailScroll.scrollTo({top:detailScroll.scrollHeight,behavior:'smooth'});
    }
  }catch(error){
    console.error('Gagal mengirim komentar:',error);
    state.detailComments=state.detailComments.filter(c=>c!==pending);
    post.commentCount=Math.max(0,post.commentCount-1);
    if(state.selectedPost?.id===post.id){
      renderComments();refreshPost(post);commentInput.value=comment;
    }
    const explanation=String(error?.message||'');
    toast(/Terlalu sering|dibatasi|rate limit/i.test(explanation)?explanation:'Komentar gagal dikirim. Perubahan dibatalkan.');
  }finally{commentBusy=false;sendButton.disabled=false;}
});

async function deletePost(post){
  if(post.user_id!==user()||!window.confirm('Hapus postingan ini? Tindakan tidak dapat dibatalkan.'))return;
  try{
    const result=await sb.from('posts').delete().eq('id',post.id).eq('user_id',user());
    if(result.error)throw result.error;
    const base=sb.storage.from('community-posts').getPublicUrl('').data.publicUrl;
    const uploaded=post.media.flatMap(m=>[m.url,m.thumbnail_url].filter(Boolean))
      .filter(url=>url.startsWith(base)).map(url=>decodeURIComponent(url.slice(base.length)).replace(/^\/+/,'')).filter(Boolean);
    if(uploaded.length)await sb.storage.from('community-posts').remove(uploaded);
    closeDetail();toast('Postingan dihapus.');await loadCommunityFeed(true);
  }catch(error){console.error(error);toast('Postingan gagal dihapus.');}
}
window.addEventListener('gm-content-moderated',()=>{
  if(openedModal===detail.surface)closeDetail();
  loadCommunityFeed(true);
});
document.getElementById('navCommunityBtn')?.addEventListener('click',()=>loadCommunityFeed());
document.querySelectorAll('#bottomNav .nav-item:not(#navCommunityBtn)').forEach(b=>b.addEventListener('click',()=>{
  if(openedModal===detail.surface)closeDetail();
}));
window.addEventListener('popstate',e=>{
  if((e.state&&e.state.gmView)==='community')loadCommunityFeed();
  else if(openedModal===detail.surface)closeDetail();
});
window.addEventListener('gm-follow-changed',()=>{lastLoadedAt=0;if(state.filter==='following')loadCommunityFeed(true);});
window.loadCommunityFeed=()=>loadCommunityFeed(true);
window.openCommunityPost=async function(id,options={}){
  if(!/^[0-9a-f-]{36}$/i.test(id))return;
  state.deepLink=id;
  state.filter='latest'; // deep links are not restricted by a previous Following filter
  if(options.returnToProfile){
    // The previous history entry remains the exact Profile subpage.
    navigatePrimaryView('community',{history:false});
    history.pushState({gmView:'community',gmRewardDetail:true},'',window.location.href);
  }else{
    navigatePrimaryView('community');
  }
  await loadCommunityFeed(true);
};
if(state.deepLink&&/^[0-9a-f-]{36}$/i.test(state.deepLink)){
  navigatePrimaryView('community',{history:false});
  loadCommunityFeed();
}
})();
