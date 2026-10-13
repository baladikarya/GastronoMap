'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const context={window:{}};
vm.runInNewContext(read('assets/js/personalization.js'),context);
const rec=context.window.GMRecommendations;
const r=(id,type,overall,lat=-6.2,lng=106.8)=>({
  id,name:id,type,priceRange:'< Rp 25rb',isVerified:true,lat,lng,
  ratings:overall==null?[]:[{userId:'other',overall}]
});
test('wishlist signals recommend similar unseen restaurants',()=>{
  rec.setIdentity('u1');
  const a=r('a','Cafe',4.6),b=r('b','Seafood',4.1),saved=r('saved','Cafe',5);
  const result=rec.rank([a,b,saved],{catalog:[a,b,saved],userId:'u1',wishlistIds:new Set(['saved'])});
  assert.equal(result[0].resto.id,'a');
  assert.ok(!result.some(x=>x.resto.id==='saved'));
  assert.match(result[0].reason,/kategori/);
});
test('fallback supports guests and location denial',()=>{
  rec.setIdentity(null);
  const result=rec.rank([r('a','Cafe',4.5),r('b','Snack',3)]);
  assert.equal(result[0].resto.id,'a');
  assert.equal(result[0].distanceM,null);
  assert.equal(rec.rank([],{}).length,0);
});
test('distance improves nearby result, invalid coordinates are ignored',()=>{
  const close=r('close','Asian',null,-6.201,106.801),far=r('far','Asian',null,-7,107);
  const result=rec.rank([far,close],{location:{lat:-6.2,lng:106.8}});
  assert.equal(result[0].resto.id,'close');
  assert.equal(rec.rank([close],{location:{lat:NaN,lng:NaN}})[0].distanceM,null);
});
test('integration uses no persistent exploration log and precaches scripts',()=>{
  const js=read('assets/js/personalization.js'),html=read('index.html');
  for(const p of ['assets/js/personalization.js','assets/js/map.js','assets/js/restaurants.js','assets/js/services.js'])
    assert.doesNotThrow(()=>new Function(read(p)));
  assert.ok(html.indexOf('assets/js/personalization.js')<html.indexOf('assets/js/map.js'));
  assert.match(read('assets/js/map.js'),/data-home-mode="personal"/);
  assert.match(read('assets/js/services.js'),/GMRecommendations\?\.setIdentity/);
  assert.match(read('assets/js/restaurants.js'),/GMRecommendations\?\.remember/);
  assert.doesNotMatch(js,/localStorage|sessionStorage|sb\.from\(|fetch\(/);
  assert.match(read('service-worker.js'),/p3-16-20261013-1/);
  assert.match(read('service-worker.js'),/\.\/assets\/js\/personalization\.js/);
});
