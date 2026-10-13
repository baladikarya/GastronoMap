'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'..');
const file=path=>fs.readFileSync(require('node:path').join(root,path),'utf8');

test('all browser scripts are valid JavaScript',()=>{
  for(const path of ['core','services','map','restaurants','events','bootstrap','moderation','community','profile','social-profile']){
    const code=file('assets/js/'+path+'.js');
    assert.doesNotThrow(()=>new Function(code),path+'.js');
  }
});

test('restaurant data pager handles more than the PostgREST default row cap',async()=>{
  const map=file('assets/js/map.js');
  const from=map.indexOf('async function fetchPagedRows(');
  const to=map.indexOf('let restaurantDataLoading=false;',from);
  assert.ok(from>=0&&to>from,'pager must be present');
  const seen=[];
  const data=Array.from({length:1207},(_,i)=>({id:String(i).padStart(5,'0')}));
  const sb={from(table){
    assert.equal(table,'restos');
    const query={
      select(){return this;},
      order(column){assert.equal(column,'id');return this;},
      async range(a,b){seen.push([a,b]);return {data:data.slice(a,b+1),error:null};}
    };
    return query;
  }};
  const fetchPagedRows=vm.runInNewContext(map.slice(from,to)+'\nfetchPagedRows',{sb});
  const found=await fetchPagedRows('restos');
  assert.equal(found.length,1207);
  assert.deepEqual(seen,[[0,499],[500,999],[1000,1499]]);
  assert.equal(found.at(-1).id,'01206');
});

test('restaurant paging fails safely on backend errors',async()=>{
  const map=file('assets/js/map.js');
  const from=map.indexOf('async function fetchPagedRows(');
  const to=map.indexOf('let restaurantDataLoading=false;',from);
  const sb={from(){return {select(){return this},order(){return this},async range(){return {data:null,error:new Error('offline')}}}}};
  const pager=vm.runInNewContext(map.slice(from,to)+'\nfetchPagedRows',{sb});
  await assert.rejects(pager('restos'),/offline/);
});

test('feed, comments and images use bounded loading with rollback',()=>{
  const community=file('assets/js/community.js');
  assert.match(community,/range\(feedOffset,feedOffset\+FEED_PAGE_SIZE\)/);
  assert.match(community,/order\('created_at',\{ascending:false\}\)\.order\('id',\{ascending:false\}\)/);
  assert.match(community,/range\(commentOffset,commentOffset\+COMMENT_PAGE_SIZE\)/);
  assert.match(community,/comment\.liked=previous/);
  assert.match(community,/post\.saved=previous/);
  assert.match(community,/post\.liked=previous/);
  assert.match(community,/compressImage\(file,1600,0\.78\)/);
  assert.match(community,/compressImage\(file,480,0\.72\)/);
  assert.match(community,/thumbnail_url/);
  assert.match(community,/IntersectionObserver/);
  assert.doesNotMatch(community,/\.limit\(50\)/);
  assert.doesNotMatch(community,/\.limit\(200\)/);
});

test('accessible focus, lazy decoding, reduced motion and SQL rollout present',()=>{
  const html=file('index.html');
  const map=file('assets/js/map.js');
  const css=file('assets/css/community.css');
  const sql=file('supabase/migrations/20261013100000_p2_stage13_media_thumbnails.sql');
  assert.match(html,/<button type="button" id="locateBtn"/);
  assert.match(html,/id="toast" role="status" aria-live="polite"/);
  assert.match(map,/decoding="async"/);
  assert.match(map,/photoLightboxReturnFocus/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/community-skeleton/);
  assert.match(sql,/add column if not exists thumbnail_url/);
});
