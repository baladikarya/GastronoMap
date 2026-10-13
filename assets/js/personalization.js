/* P3-16: privacy-first, explainable recommendations; session signals are in memory only. */
(() => {
  'use strict';
  let identity = null;
  const viewed = new Map();
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function setIdentity(id){
    if((id||null)!==identity){identity=id||null;viewed.clear();}
  }
  function remember(r){
    if(!r||!r.id)return;
    viewed.delete(String(r.id));
    viewed.set(String(r.id),true);
    if(viewed.size>30)viewed.delete(viewed.keys().next().value);
  }
  function distance(a,b){
    if(!a||!b||a.lat==null||a.lng==null||b.lat==null||b.lng==null)return null;
    const p=[a.lat,a.lng,b.lat,b.lng].map(Number);
    if(!p.every(Number.isFinite)||Math.abs(p[0])>90||Math.abs(p[2])>90||Math.abs(p[1])>180||Math.abs(p[3])>180)return null;
    const r=Math.PI/180,dl=(p[2]-p[0])*r,dg=(p[3]-p[1])*r;
    const h=Math.sin(dl/2)**2+Math.cos(p[0]*r)*Math.cos(p[2]*r)*Math.sin(dg/2)**2;
    return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
  }
  function rank(restos,options={}){
    const catalog=Array.isArray(options.catalog)?options.catalog:(restos||[]);
    const wishlist=options.wishlistIds&&typeof options.wishlistIds.has==='function'?options.wishlistIds:new Set();
    const visited=options.visitedIds&&typeof options.visitedIds.has==='function'?options.visitedIds:new Set();
    const types=new Map(),prices=new Map(),userId=options.userId||null;
    let strong=0;
    function add(r,weight){
      if(r.type)types.set(r.type,(types.get(r.type)||0)+weight);
      if(r.priceRange)prices.set(r.priceRange,(prices.get(r.priceRange)||0)+weight);
    }
    if(userId)for(const r of catalog){
      if(wishlist.has(r.id)){add(r,3);strong++;}
      if(visited.has(r.id))add(r,0.6); // visiting is not a positive review
      const mine=(r.ratings||[]).find(v=>v.userId===userId);
      if(mine){
        const score=Number(mine.overall);
        if(Number.isFinite(score)&&score>=4){add(r,2+score-4);strong++;}
        else if(Number.isFinite(score)&&score<=2.5)add(r,-1.5);
      }
    }
    const byId=new Map(catalog.map(r=>[String(r.id),r]));
    for(const id of viewed.keys())if(byId.has(id))add(byId.get(id),0.35);
    const candidates=(restos||[]).filter(r=>r&&r.id);
    const unseen=candidates.filter(r=>!wishlist.has(r.id)&&!visited.has(r.id));
    const pool=unseen.length?unseen:candidates;
    const ranked=pool.map(resto=>{
      const vals=(resto.ratings||[]).map(v=>Number(v.overall)).filter(v=>Number.isFinite(v)&&v>=1&&v<=5);
      const count=vals.length,avg=count?vals.reduce((s,v)=>s+v,0)/count:0;
      const quality=(avg*count+3.8*4)/(count+4); // Bayesian smoothing for sparse reviews
      const dist=distance(options.location,resto);
      const typeBoost=clamp((types.get(resto.type)||0)*2.6,-9,14);
      const priceBoost=clamp((prices.get(resto.priceRange)||0)*1.4,-5,8);
      const score=quality*10+Math.min(count,12)*0.3+typeBoost+priceBoost+
        (dist==null?0:9/(1+dist/1800))+(resto.isVerified?1:0);
      let reason='Pilihan untuk dijelajahi';
      if(strong>0&&typeBoost>=4)reason='Sesuai kategori yang Anda sukai';
      else if(count>=3&&quality>=4.1)reason='Rating komunitas tinggi';
      else if(dist!=null&&dist<=2000)reason='Dekat dengan lokasi Anda';
      else if(count>0)reason='Dinilai oleh komunitas';
      return {resto,distanceM:dist,reason,score};
    });
    ranked.sort((a,b)=>b.score-a.score||
      String(a.resto.name||'').localeCompare(String(b.resto.name||''),'id')||
      String(a.resto.id).localeCompare(String(b.resto.id)));
    return ranked;
  }
  window.GMRecommendations=Object.freeze({rank,remember,setIdentity});
})();
