'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const rootDir=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(rootDir,file),'utf8');
const UID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function profileHarness(admin=false){
 const dynamic={innerHTML:''},scroll={scrollTop:0},ownSocial={isConnected:true};
 const root={innerHTML:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},
  contains(){return true;},
  querySelector(selector){
   if(selector==='.profile-dynamic')return dynamic;
   if(selector==='#profileOwnSocial'&&this.innerHTML.includes('profileOwnSocial'))return ownSocial;
   return null;
  }};
 const dummy={textContent:'',classList:{toggle(){},add(){},remove(){}},click(){}};
 const document={getElementById(id){return id==='profileDashboard'?root:id==='accountOverlay'?scroll:dummy;}};
 const records=[],states=[{gmView:'profile'}];let index=0;
 const window={renderOwnSocialProfile(node,{onReady}){records.push(['social',node===ownSocial]);onReady();},
  openSocialProfile(id){records.push(['public',id]);},addEventListener(){}};
 const history={get state(){return states[index];},
  pushState(state){states.splice(++index);states.push(state);},
  replaceState(state){states[index]=state;},
  back(){if(index>0)index--;window.renderProfileDashboard();}};
 const tables={
  user_follows:[{follower_id:OTHER,following_id:UID}],
  public_social_profiles:[{id:OTHER,username:'Other User',city:'Bandung',avatar_url:null,is_verified_contributor:true}]
 };
 const sb={
  from(table){
   let entries=(tables[table]||[]).slice(),countOnly=false;
   const query={
    select(_columns,opts){countOnly=!!opts?.head;return this;},
    eq(key,value){entries=entries.filter(x=>x[key]===value);return this;},
    in(key,values){entries=entries.filter(x=>values.includes(x[key]));return this;},
    is(){return this;},gte(){return this;},order(){return this;},
    limit(size){return Promise.resolve({data:entries.slice(0,size),error:null,count:countOnly?entries.length:null});},
    maybeSingle(){return Promise.resolve({data:entries[0]||null,error:null});},
    then(resolve,reject){return Promise.resolve({data:entries,error:null,count:countOnly?entries.length:null}).then(resolve,reject);}
   };return query;
  },
  rpc:async()=>({data:{contributions:9,points:21,visited:3,verified:false,approved_count:1,full_reviews:2},error:null}),
  channel(){return {on(){return this;},subscribe(){return this;}};},
  removeChannel(){}
 };
 const context={
  document,window,history,sb,myUserId:UID,myUsername:'Tester',myEmail:'test@example.org',
  myAvatarUrl:null,myBio:'',myCity:'Jakarta',myInstagram:null,myTiktok:null,myWebsite:null,
  isAdmin:admin,wishlistIds:new Set(),visitedIds:new Set(),allRestos:{},
  localStorage:{getItem(){return null;}},location:{href:'https://example.org/'},
  showToast(){},getNewRestosForMe(){return [];},openProfileCompletionModal(){},
  signOut(){},navigatePrimaryView(){},openDetail(){},openDetailContributionActivity(){},loadAllRestos:async()=>{}
 };
 vm.runInNewContext(read('assets/js/profile.js'),context);
 async function click(action,id){
  const button={dataset:{action,id},closest(){return this;}};
  await root.handlers.click({target:{closest(){return button;}}});
  for(let i=0;i<8;i++)await Promise.resolve();
 }
 return {root,dynamic,scroll,window,history,records,click};
}

test('Profile landing is embedded social identity; private features live in Menu Saya',async()=>{
 const h=profileHarness();
 h.window.renderProfileDashboard();
 assert.match(h.root.innerHTML,/id="profileOwnSocial"/);
 assert.match(h.root.innerHTML,/data-action="notifications"/);
 assert.match(h.root.innerHTML,/data-action="menu"/);
 assert.doesNotMatch(h.root.innerHTML,/My Posts|Profil Publik/);
 assert.ok(h.records.some(x=>x[0]==='social'&&x[1]));
 await h.click('menu');
 for(const item of ['Aktivitas Saya','Saved','Visited','My Contributions','Riwayat Poin',
  'Reports','Settings','Help &amp; Support','Logout']){
  assert.ok(h.root.innerHTML.includes(item),item);
 }
 assert.doesNotMatch(h.root.innerHTML,/My Posts|data-action="publicProfile"/);
});

test('Profile subpages and browser Back restore the originating menu and scroll',async()=>{
 const h=profileHarness();
 h.window.renderProfileDashboard();
 h.scroll.scrollTop=410;
 await h.click('menu');
 assert.equal(h.history.state.gmProfilePage,'menu');
 await h.click('saved');
 assert.equal(h.history.state.gmProfilePage,'saved');
 await h.click('home');
 assert.equal(h.history.state.gmProfilePage,'menu');
 assert.match(h.root.innerHTML,/Menu Saya/);
 await h.click('home');
 assert.equal(h.history.state.gmProfilePage,undefined);
 assert.equal(h.scroll.scrollTop,410);
 await h.click('notifications');
 assert.equal(h.history.state.gmProfilePage,'notifications');
 await h.click('home');
 assert.match(h.root.innerHTML,/profileOwnSocial/);
});

test('Followers list opens another public profile; Admin keeps moderation controls',async()=>{
 const h=profileHarness(true);
 h.window.renderProfileDashboard();
 await h.click('menu');
 assert.match(h.root.innerHTML,/Administrasi/);
 assert.match(h.root.innerHTML,/Pusat Moderasi/);
 assert.match(h.root.innerHTML,/Kelola Link Online/);
 await h.click('home');
 h.window.openProfileFollowList('followers');
 for(let i=0;i<8;i++)await Promise.resolve();
 assert.match(h.dynamic.innerHTML,/Other User/);
 await h.click('socialUser',OTHER);
 assert.ok(h.records.some(x=>x[0]==='public'&&x[1]===OTHER));
});

test('Owned posts retain Edit/Hapus; other users remain read-only',()=>{
 const social=read('assets/js/social-profile.js');
 assert.doesNotThrow(()=>new Function(social));
 assert.match(social,/window\.renderOwnSocialProfile=renderOwnSocialProfile/);
 assert.match(social,/social-profile-post-options/);
 assert.match(social,/social-profile-own-editor/);
 assert.match(social,/\.update\(\{caption:value/);
 assert.match(social,/\.delete\(\)\.eq\('id',post\.id\)\.eq\('user_id',id\)/);
 assert.match(social,/openCommunityPost\(post\.id,\{returnToProfile:true\}\)/);
 assert.match(social,/window\.openProfileFollowList/);
 assert.doesNotMatch(read('assets/js/profile.js'),/function loadMyPosts|data-action="publicProfile"|My Posts/);
});

test('Menu icons, page history, and PWA assets are wired',()=>{
 const svg=read('assets/icons/ui.svg'),js=read('assets/js/profile.js'),nav=read('assets/js/events.js');
 const sw=read('service-worker.js');
 for(const file of ['assets/js/profile.js','assets/js/social-profile.js','assets/js/events.js','service-worker.js'])
  assert.doesNotThrow(()=>new Function(read(file)),file);
 assert.match(svg,/<symbol id="menu"/);
 assert.match(svg,/<symbol id="award"/);
 assert.match(js,/gmProfilePage:next/);
 assert.match(js,/history\.back\(\)/);
 assert.match(nav,/window\.openProfileHome\?\.\(\)/);
 assert.match(sw,/p3-16-20261013-2/);
 for(const file of ['profile.css','social-profile.css'])
  assert.ok(sw.includes("'./assets/css/"+file+"'"));
});


test('Owner social grid can edit/delete posts and deep-link to the original post',async()=>{
 class Element{
  constructor(tag){
   this.tagName=tag;this.children=[];this.className='';this.id='';this.textContent='';
   this.hidden=false;this.disabled=false;this.isConnected=true;this.handlers={};
   this.value='';this.classList={add(){},remove(){}};
  }
  append(...nodes){for(const node of nodes)if(node){node.parent=this;this.children.push(node);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(name,value){(this.attributes||(this.attributes={}))[name]=value;}
  addEventListener(name,fn){this.handlers[name]=fn;}
  querySelector(selector){
   const matches=node=>selector[0]==='#'?node.id===selector.slice(1):
    node.className.split(/\s+/).includes(selector.slice(1));
   const visit=node=>{for(const child of node.children){
    if(matches(child))return child;
    const nested=visit(child);if(nested)return nested;
   }return null;};
   return visit(this);
  }
  querySelectorAll(selector){
   const found=[];
   const visit=node=>{for(const child of node.children){
    if(child.className.split(/\s+/).includes(selector.slice(1)))found.push(child);
    visit(child);
   }};
   visit(this);return found;
  }
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
  focus(){}scrollIntoView(){}
 }
 const postId='11111111-1111-4111-8111-111111111111';
 const posts=[{id:postId,user_id:UID,caption:'Caption lama',created_at:'2026-10-10T12:00:00Z',location_name:'Jakarta'}];
 const profile={id:UID,username:'Tester',avatar_url:null,bio:'Suka makan',city:'Jakarta',
  is_verified_contributor:true,resto_approved_count:3,full_review_count:5};
 const calls=[];
 const tables={public_social_profiles:[profile],posts,post_media:[],user_follows:[]};
 const sb={
  from(table){
   let rows=(tables[table]||[]).slice(),head=false,operation=null,payload=null;
   return {
    select(_fields,opts){head=!!opts?.head;return this;},
    eq(key,value){rows=rows.filter(x=>x[key]===value);return this;},
    in(key,values){rows=rows.filter(x=>values.includes(x[key]));return this;},
    order(){return this;},
    maybeSingle(){return Promise.resolve({data:rows[0]||null,error:null});},
    range(start,end){return Promise.resolve({data:rows.slice(start,end+1),error:null});},
    update(value){operation='update';payload=value;return this;},
    delete(){operation='delete';return this;},
    then(resolve,reject){
     if(operation==='update')rows.forEach(row=>Object.assign(row,payload));
     if(operation==='delete')tables[table]=tables[table].filter(row=>!rows.includes(row));
     return Promise.resolve({data:head?null:rows,count:head?rows.length:null,error:null}).then(resolve,reject);
    }
   };
  },
  storage:{from(){return {getPublicUrl(){return {data:{publicUrl:'https://storage.example/'}};},
   remove(){return Promise.resolve({error:null});}};}}
 };
 const document={body:new Element('body'),createElement(tag){return new Element(tag);},
  getElementById(){return {click(){}};},activeElement:null};
 const window={addEventListener(){},dispatchEvent(){},confirm(){return true;},
  openProfileFollowList(kind){calls.push(['list',kind]);},
  openCommunityPost(id,opts){calls.push(['post',id,opts.returnToProfile]);}};
 const context={document,window,sb,myUserId:UID,myInstagram:'',myTiktok:'',myWebsite:'',
  showToast(){},history:{state:{gmView:'profile'},pushState(){},replaceState(){},back(){}},
  location:{href:'https://example.org'},requestAnimationFrame:fn=>fn(),
  Event:class Event{constructor(type){this.type=type;}}};
 vm.runInNewContext(read('assets/js/social-profile.js'),context);
 const own=new Element('main'),ready=[];
 await window.renderOwnSocialProfile(own,{onReady:()=>ready.push(true)});
 assert.equal(ready.length,1);
 assert.ok(own.querySelector('.social-profile-verified'));
 assert.equal(own.querySelectorAll('.social-profile-own-post').length,1);
 const card=own.querySelector('.social-profile-own-post');
 card.querySelector('.social-profile-post-open').handlers.click();
 assert.ok(calls.some(x=>x[0]==='post'&&x[1]===postId&&x[2]));
 const stats=own.querySelectorAll('.social-profile-stat');
 stats[1].handlers.click();
 assert.ok(calls.some(x=>x[0]==='list'&&x[1]==='followers'));
 card.querySelector('.social-profile-post-options').handlers.click();
 const actions=card.querySelector('.social-profile-own-post-actions');
 actions.children[0].handlers.click();
 const editor=card.querySelector('.social-profile-own-editor');
 editor.children[0].value='Caption baru';
 await editor.children[1].handlers.click();
 assert.equal(posts[0].caption,'Caption baru');
 await actions.children[1].handlers.click();
 assert.equal(tables.posts.length,0);
 assert.equal(own.querySelectorAll('.social-profile-own-post').length,0);
});


test('Settings excludes Edit Profile/Logout; private detail links return to their Profile source',()=>{
 const profile=read('assets/js/profile.js'),social=read('assets/js/social-profile.js');
 const settings=profile.slice(profile.indexOf('function renderSettings(){'),
  profile.indexOf('async function openPost(',profile.indexOf('function renderSettings(){')));
 assert.doesNotMatch(settings,/menuRow\('Edit Profile'|menuRow\('Logout'/);
 assert.match(profile,/menuRow\('Logout','Keluar dari akun GastronoMap'/);
 assert.match(profile,/navigatePrimaryView\('home',\{history:false\}\)/);
 assert.match(profile,/gmContributionDetail:true/);
 assert.match(profile,/if\(action==='post'\)\{await openPost\(id,true\)/);
 assert.match(social,/if\(id!==uid\(\)\)\{/);
 assert.match(social,/Laporkan Akun/);
});
