import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {dataPath} from './data-path.mjs';

export const popularityInterval=24*60*60*1000;
const seed=new URL('../data/pf-popularity.json',import.meta.url);
let cached,checkedAt=0,inFlight,readPending;
export function normalizePopularity(hits,expected,now=Date.now()){
 if(!Array.isArray(hits)||hits.length!==expected||expected<1000)throw Error('Incomplete PF popularity response');
 const scores={},seen=new Set();
 for(const hit of hits){
  const code=String(hit.configSku||'');
  if(!/^[a-zA-Z0-9-]+$/.test(code)||seen.has(code))throw Error('Invalid or duplicate PF model');
  seen.add(code);
  if(hit.popularity_values!==undefined&&hit.popularity_values!==null){
   const raw=Array.isArray(hit.popularity_values)&&hit.popularity_values.length===1?hit.popularity_values[0]:hit.popularity_values;
   if(!['number','string'].includes(typeof raw)||String(raw).trim()===''||!Number.isFinite(Number(raw)))throw Error('Invalid PF popularity score');
   scores[`pf-${code}`]=Number(raw);
  }
 }
 if(Object.keys(scores).length<expected*.8)throw Error('Missing PF popularity scores');
 return {source:'PF Danish webshop popularity_values',updatedAt:new Date(now).toISOString(),modelCount:expected,scores};
}
function valid(snapshot){return snapshot&&Number.isFinite(Date.parse(snapshot.updatedAt))&&snapshot.scores&&Object.keys(snapshot.scores).length>=800&&Object.values(snapshot.scores).every(Number.isFinite);}
export function loadPopularity(){
 if(readPending)return readPending;
 readPending=readPopularitySnapshot().finally(()=>{readPending=null;});return readPending;
}
async function readPopularitySnapshot(){
 if(cached&&Date.now()-checkedAt<60_000)return cached;
 for(const path of [dataPath('pf-popularity.json'),seed]){
  try{const snapshot=JSON.parse(await readFile(path,'utf8'));if(valid(snapshot)){cached=snapshot;checkedAt=Date.now();return snapshot;}}catch{}
 }
 return cached||{scores:{},updatedAt:null};
}
export async function fetchPopularity(fetcher=fetch){
 const origin='https://www.pfconcept.com',danishURL=origin+'/da_dk/bestseller.html';
 const cookies=new Map();
 const request=async(url,options={})=>{
  const response=await fetcher(url,{...options,redirect:'manual',headers:{...options.headers,Cookie:[...cookies].map(([key,value])=>`${key}=${value}`).join('; ')},signal:AbortSignal.timeout(30_000)});
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],split=pair.indexOf('=');if(split>0)cookies.set(pair.slice(0,split),pair.slice(split+1));}
  return response;
 };
 const allowedURL=value=>{const url=new URL(value,origin);if(url.origin!==origin||url.username||url.password)throw Error('Unexpected PF redirect');return url;};
 const pageAt=async start=>{
  let url=allowedURL(start);
  for(let attempt=0;attempt<8;attempt++){
   const page=await request(url.href);
   if([301,302,303,307,308].includes(page.status)){
    const location=page.headers.get('location');if(!location)throw Error('Unexpected PF redirect');
    url=allowedURL(new URL(location,url).href);continue;
   }
   if(!page.ok)throw Error('PF page unavailable');
   return {url,html:await page.text()};
  }
  throw Error('PF redirect limit exceeded');
 };
 let {url,html}=await pageAt(danishURL);
 if(url.pathname!=='/da_dk/bestseller.html'){
  // Use the supplier's public country selector, scoped to this anonymous session.
  // A store cookie alone does not override the provider's server-side locale choice.
  const raw=html.match(/window\.country_switcher_data\s*=\s*(\{[^\n]*\})\s*;?\s*<\/script>/)?.[1];
  if(!raw)throw Error('PF country selector missing');
  const selector=JSON.parse(raw),denmark=selector.countries?.find(country=>country.iso_code==='dk');
  if(!denmark?.stores?.some(store=>store.store_code==='da_dk'))throw Error('PF Danish store missing');
  if(typeof selector.switcher_submit_url!=='string')throw Error('PF country selector missing');
  const submit=allowedURL(selector.switcher_submit_url);
  if(!/^\/[a-z]{2}_[a-z]{2}\/bestseller\.html$/.test(submit.pathname))throw Error('Unexpected PF country selector');
  const from=selector.preselect?.store_code;
  if(typeof from!=='string'||!/^([a-z]{2}_[a-z]{2})$/.test(from))throw Error('Invalid PF country selector');
  const response=await request(submit.href,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest'},body:new URLSearchParams({country_iso:'dk',store_code:'da_dk',current_url:danishURL,___from_store:from,action:'set_session'}).toString()});
  if(!response.ok)throw Error('PF country selection failed');
  const selected=await response.json();
  if(selected.status!==1||typeof selected.store_url!=='string')throw Error('PF country selection failed');
  const target=allowedURL(selected.store_url);
  if(target.pathname!=='/da_dk/bestseller.html')throw Error('PF Danish locale unavailable');
  ({url,html}=await pageAt(target.href));
  if(url.pathname!=='/da_dk/bestseller.html')throw Error('PF Danish locale unavailable');
 }
 const match=html.match(/window\.algoliaConfig\s*=\s*JSON\.parse\('([^']+)'\)/);
 if(!match)throw Error('PF search configuration missing');
 // Decode the escaped public JSON configuration, never execute supplier JavaScript.
 const config=JSON.parse(match[1].replace(/\\u([a-f0-9]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))));
 if(!/^[A-Z0-9]+$/.test(config.applicationId)||typeof config.apiKey!=='string')throw Error('Invalid PF search configuration');
 const index=config.sortingIndices?.find(item=>item.attribute==='popularity_values'&&item.sort==='desc')?.name;
 if(!index||!index.startsWith('prod_da_dk_'))throw Error('PF popularity index missing');
 const query=async page=>{
  const params=new URLSearchParams({query:'',hitsPerPage:'1000',page:String(page),attributesToRetrieve:JSON.stringify(['configSku','popularity_values']),attributesToHighlight:'[]'});
  const response=await fetcher(`https://${config.applicationId.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`,{method:'POST',headers:{'Content-Type':'application/json','X-Algolia-Application-Id':config.applicationId,'X-Algolia-API-Key':config.apiKey},body:JSON.stringify({requests:[{indexName:index,params:params.toString()}]}),signal:AbortSignal.timeout(30_000)});
  if(!response.ok)throw Error('PF search unavailable');
  const result=(await response.json()).results?.[0];
  if(!result||result.message||!Array.isArray(result.hits))throw Error('Invalid PF search response');
  return result;
 };
 const first=await query(0),hits=[...first.hits];
 if(!Number.isInteger(first.nbPages)||first.nbPages<1||first.nbPages>30)throw Error('Unexpected PF page count');
 for(let page=1;page<first.nbPages;page++){const result=await query(page);if(result.nbHits!==first.nbHits)throw Error('PF list changed during download');hits.push(...result.hits);}
 return normalizePopularity(hits,first.nbHits);
}
async function savePopularity(snapshot){
 const path=dataPath('pf-popularity.json');await mkdir(dirname(path),{recursive:true});
 await writeFile(path+'.tmp',JSON.stringify(snapshot));await rename(path+'.tmp',path);cached=snapshot;checkedAt=Date.now();
}
export async function refreshPopularity({load=loadPopularity,download=fetchPopularity,save=savePopularity,now=Date.now()}={}){
 const previous=await load();
 if(now-Date.parse(previous.updatedAt)<popularityInterval)return false;
 const next=await download();
 if(!valid(next))throw Error('Invalid PF popularity snapshot');
 await save(next);return true;
}
export function startPopularitySync({run=task=>task()}={}){
 const tick=()=>{if(inFlight)return;inFlight=Promise.resolve().then(()=>run(()=>refreshPopularity())).then(updated=>{if(updated===true)console.log('PF popularity updated');}).catch(()=>console.error('PF popularity update failed; last successful snapshot retained.')).finally(()=>{inFlight=null;});};
 setTimeout(tick,5000).unref();
 // Check hourly; download only when the persisted snapshot is at least 24 hours old.
 setInterval(tick,60*60*1000).unref();
}
