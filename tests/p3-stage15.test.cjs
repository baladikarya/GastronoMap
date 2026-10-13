'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Community Stage 15 integrates server discovery without breaking feed or composer',()=>{
  const js=read('assets/js/community.js');
  assert.doesNotThrow(()=>new Function(js));
  for(const required of [
    "gm_community_discover","p_mode:state.filter","p_offset:feedOffset",
    "p_limit:FEED_PAGE_SIZE+1","state.filter==='nearby'","state.filter==='popular'",
    "function criteriaKey()","function applyArea()","topicSelect.addEventListener('change'",
    "if(topicInput.value)newPost.topic=topicInput.value",
    "if(response.error&&['42703','PGRST204'].includes(response.error.code))",
    "const selection=++locationSelection",
    "state.filter='latest';state.area='';state.topic=''",
    "navigator.share({title:message,text:"
  ])assert.ok(js.includes(required),required+' missing');
  assert.doesNotMatch(js,/posts\.sort\(\(a,b\)=>\(b\.likeCount/);
  assert.doesNotMatch(js,/Belum ada cerita terdekat dalam hasil yang dimuat/);
  assert.match(js,/filter:.*'latest',area:'',topic:''/);
  assert.match(js,/distance_km\.toLocaleString\('id-ID'/);
});

test('Stage 15 migration is additive and uses caller permissions',()=>{
  const sql=read('supabase/migrations/20261013103000_p3_stage15_community_discovery.sql');
  assert.match(sql,/add column if not exists topic text/i);
  assert.match(sql,/check \(topic is null or topic in \(/i);
  assert.match(sql,/security invoker set search_path = ''/);
  assert.match(sql,/from public\.posts p/);
  assert.match(sql,/from public\.user_follows f/);
  assert.match(sql,/from public\.post_likes l/);
  assert.match(sql,/from public\.comments c/);
  assert.match(sql,/distance_km <= 25/);
  assert.match(sql,/interval '30 days'/);
  assert.match(sql,/coalesce\(p\.location_name/);
  assert.match(sql,/grant execute on function public\.gm_community_discover/);
  assert.doesNotMatch(sql,/security definer/i);
  assert.doesNotMatch(sql,/drop table|truncate table|delete from public\./i);
});

test('Discovery styles remain accessible on mobile and PWA cache is refreshed',()=>{
  const css=read('assets/css/community.css');
  const sw=read('service-worker.js');
  assert.match(css,/community-discovery-controls/);
  assert.match(css,/community-post-topic/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/min-height:44px/);
  assert.match(sw,/p3-15-20261013-1/);
});
