import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePopularity,refreshPopularity,popularityInterval,fetchPopularity} from '../lib/pf-popularity.mjs';
import {sortPFProducts} from '../dist/pf-filters.mjs';
const hits=Array.from({length:1000},(_,i)=>({configSku:String(100000+i),popularity_values:99999-i}));
const now=Date.parse('2026-10-23T06:00:00Z');
test('normalizes PF model scores, including singleton arrays and missing scores',()=>{
 const rows=structuredClone(hits);rows[0].popularity_values=['99999'];delete rows[1].popularity_values;
 const result=normalizePopularity(rows,1000,now);
 assert.equal(result.scores['pf-100000'],99999);assert.equal(result.scores['pf-100001'],undefined);
 assert.throws(()=>normalizePopularity(rows.slice(1),1000));
 assert.throws(()=>normalizePopularity([...rows.slice(0,999),rows[0]],1000));
});
test('popular ordering puts highest first, missing last, and retains price sort',()=>{
 const products=[{id:'a',name:'A',popularity:null},{id:'b',name:'B',popularity:10},{id:'c',name:'C',popularity:30}];
 assert.deepEqual(sortPFProducts(products,'popular').map(p=>p.id),['c','b','a']);
 assert.deepEqual(sortPFProducts(products,'price-asc',{products:{a:{fromIncVat:1},b:{fromIncVat:2},c:{fromIncVat:3}}}).map(p=>p.id),['a','b','c']);
 assert.deepEqual(products.map(p=>p.id),['a','b','c']);
});
test('daily refresh skips fresh data and retains previous data on supplier failure',async()=>{
 const previous=normalizePopularity(hits,1000,now);let writes=0,downloads=0;
 const load=async()=>previous,save=async()=>{writes++;},download=async()=>{downloads++;throw Error('offline');};
 assert.equal(await refreshPopularity({load,save,download,now:now+popularityInterval-1}),false);
 assert.equal(downloads,0);
 await assert.rejects(refreshPopularity({load,save,download,now:now+popularityInterval}));assert.equal(writes,0);
 assert.equal(await refreshPopularity({load,save,download:async()=>normalizePopularity(hits,1000,now+popularityInterval),now:now+popularityInterval}),true);assert.equal(writes,1);
});
test('downloads all pages and carries PF locale cookie without executing page scripts',async()=>{
 let calls=0;
 const config={applicationId:'PUBLICAPP',apiKey:'public-search-key',sortingIndices:[{attribute:'popularity_values',sort:'desc',name:'prod_da_dk_products_popularity_values_desc'}]};
 const fetcher=async(url,options)=>{
  calls++;
  if(calls===1)return new Response('',{status:302,headers:{location:'https://www.pfconcept.com/da_dk/bestseller.html','set-cookie':'store=da_dk; Path=/'}});
  if(calls===2){assert.match(options.headers.Cookie,/store=da_dk/);return new Response(`window.algoliaConfig = JSON.parse('${JSON.stringify(config)}')`);}
  const request=JSON.parse(options.body).requests[0],page=Number(new URLSearchParams(request.params).get('page'));
  return Response.json({results:[{hits:hits.slice(page*500,(page+1)*500),nbHits:1000,nbPages:2}]});
 };
 const result=await fetchPopularity(fetcher);assert.equal(result.modelCount,1000);assert.equal(calls,4);
});
