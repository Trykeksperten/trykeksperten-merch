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

const danishConfig={applicationId:'PUBLICAPP',apiKey:'public-search-key',sortingIndices:[{attribute:'popularity_values',sort:'desc',name:'prod_da_dk_products_popularity_values_desc'}]};
const countrySelector={countries:[{iso_code:'dk',stores:[{store_code:'da_dk'}]}],preselect:{store_code:'en_nl'},switcher_submit_url:'https://www.pfconcept.com/en_nl/bestseller.html?___from_store=en_nl'};
function localeFixture({selector=countrySelector,selection={status:1,store_url:'https://www.pfconcept.com/da_dk/bestseller.html'},selectionStatus=200,redirectAgain=false,wrongIndex=false,partial=false}={}){
 const calls=[];let selected=false;
 const fetcher=async(value,options={})=>{
  const url=new URL(value);calls.push({url,options});
  assert.ok(['www.pfconcept.com','publicapp-dsn.algolia.net'].includes(url.hostname),'no unexpected destination');
  if(url.hostname==='publicapp-dsn.algolia.net'){
   assert.ok(selected);assert.equal(options.headers.Cookie,undefined,'supplier cookies never reach search host');
   assert.equal(JSON.parse(options.body).requests[0].indexName,'prod_da_dk_products_popularity_values_desc');
   return Response.json({results:[{hits:partial?hits.slice(0,999):hits,nbHits:1000,nbPages:1}]});
  }
  assert.equal(options.redirect,'manual');
  if(options.method==='POST'){
   assert.equal(url.href,countrySelector.switcher_submit_url);
   const form=new URLSearchParams(options.body);
   assert.deepEqual(Object.fromEntries(form),{country_iso:'dk',store_code:'da_dk',current_url:'https://www.pfconcept.com/da_dk/bestseller.html',___from_store:'en_nl',action:'set_session'});
   assert.match(options.headers.Cookie,/session=anonymous/);
   selected=true;
   return Response.json(selection,{status:selectionStatus,headers:{'set-cookie':'store=da_dk; Path=/'}});
  }
  if(url.pathname==='/da_dk/bestseller.html'){
   if(!selected||redirectAgain)return new Response('',{status:302,headers:{location:'/en_nl/bestseller.html','set-cookie':'session=anonymous; Path=/'}});
   assert.match(options.headers.Cookie,/store=da_dk/);
   const config=wrongIndex?{...danishConfig,sortingIndices:[{attribute:'popularity_values',sort:'desc',name:'prod_en_nl_products_popularity_values_desc'}]}:danishConfig;
   return new Response(`window.algoliaConfig = JSON.parse('${JSON.stringify(config)}')`);
  }
  return new Response(`<script>window.country_switcher_data = ${JSON.stringify(selector)}</script>`);
 };
 return {fetcher,calls};
}
test('country selector recovers a server-side Dutch redirect and downloads only Danish scores',async()=>{
 const {fetcher,calls}=localeFixture();const result=await fetchPopularity(fetcher);
 assert.equal(result.modelCount,1000);assert.equal(Object.keys(result.scores).length,1000);
 assert.equal(calls.length,5);assert.equal(calls.filter(x=>x.options.method==='POST'&&x.url.hostname==='www.pfconcept.com').length,1);
});
for(const [name,options,error] of [
 ['wrong selected country',{selection:{status:1,store_url:'https://www.pfconcept.com/en_nl/bestseller.html'}},/Danish locale/],
 ['locale still redirects after selection',{redirectAgain:true},/Danish locale/],
 ['wrong index on Danish URL',{wrongIndex:true},/popularity index missing/],
 ['incomplete results',{partial:true},/Incomplete PF popularity/],
 ['denied country selection',{selectionStatus:403},/country selection failed/],
 ['unsuccessful country selection',{selection:{status:0}},/country selection failed/],
 ['external selector destination',{selector:{...countrySelector,switcher_submit_url:'https://unapproved.example/select'}},/Unexpected PF redirect/],
 ['external selected destination',{selection:{status:1,store_url:'https://unapproved.example/da_dk/bestseller.html'}},/Unexpected PF redirect/],
 ['unexpected selector action',{selector:{...countrySelector,switcher_submit_url:'https://www.pfconcept.com/en_nl/customer/account/'}},/Unexpected PF country selector/],
 ['missing Danish store',{selector:{...countrySelector,countries:[]}},/Danish store missing/],
 ['invalid source locale',{selector:{...countrySelector,preselect:{store_code:'bad\r\nvalue'}}},/Invalid PF country selector/],
])test(name+' rejects the download and preserves the previous snapshot',async()=>{
 const {fetcher}=localeFixture(options),previous=normalizePopularity(hits,1000,now),before=JSON.stringify(previous);let writes=0;
 await assert.rejects(refreshPopularity({load:async()=>previous,download:()=>fetchPopularity(fetcher),save:async()=>{writes++;},now:now+popularityInterval}),error);
 assert.equal(writes,0);assert.equal(JSON.stringify(previous),before);
});
test('external initial redirects are refused before cookies can leave PF',async()=>{
 let calls=0;await assert.rejects(fetchPopularity(async()=>{calls++;return new Response('',{status:302,headers:{location:'https://unapproved.example/','set-cookie':'session=anonymous'}});}),/Unexpected PF redirect/);assert.equal(calls,1);
});
test('redirect loops are bounded without attempting country selection',async()=>{
 let calls=0;await assert.rejects(fetchPopularity(async()=>{calls++;return new Response('',{status:302,headers:{location:'/da_dk/bestseller.html'}});}),/redirect limit/);assert.equal(calls,8);
});
test('missing redirect location is refused',async()=>{
 await assert.rejects(fetchPopularity(async()=>new Response('',{status:302})),/Unexpected PF redirect/);
});
