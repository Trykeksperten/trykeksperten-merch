import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {normalizePrices,normalizeStock} from './pf-pricing.mjs';
import {dataPath} from './data-path.mjs';

async function input(file,url){
 if(file)return JSON.parse(await readFile(file,'utf8'));
 if(!url)throw Error('Feedforbindelsen er ikke konfigureret.');
 const parsed=new URL(url);
 if(parsed.hostname!=='www.pfconcept.com'||!parsed.pathname.startsWith('/portal/datafeed/')||!['http:','https:'].includes(parsed.protocol))throw Error('Ugyldig PF-feedadresse.');
 parsed.protocol='https:';
 const response=await fetch(parsed,{redirect:'follow',signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error(`PF-feed svarede HTTP ${response.status}.`);
 return response.json();
}
async function save(name,data){
 await mkdir(dataPath(),{recursive:true,mode:0o700});
 const target=dataPath(name);
 await writeFile(`${target}.tmp`,JSON.stringify(data),{mode:0o600});
 await rename(`${target}.tmp`,target);
}
// Each snapshot is validated and replaced independently. Failed feeds keep their last good file.
export async function syncPFFeeds({env=process.env,read=input,write=save}={}){
 const result=await Promise.allSettled([
  (async()=>{const [goods,print]=await Promise.all([read(env.PF_PRICE_FILE,env.PF_PRICE_FEED_URL),read(env.PF_PRINT_PRICE_FILE,env.PF_PRINT_PRICE_FEED_URL)]);const prices=normalizePrices(goods,print);await write('pf-prices.json',prices);return {productDate:prices.productDate,printDate:prices.printDate};})(),
  (async()=>{const stock=normalizeStock(await read(env.PF_STOCK_FILE,env.PF_STOCK_FEED_URL));await write('pf-stock.json',stock);return {updatedAt:stock.updatedAt};})()
 ]);
 // Report only controlled labels; supplier URLs may contain credentials.
 return Object.fromEntries(['prices','stock'].map((name,index)=>[name,result[index].status==='fulfilled'?{ok:true,...result[index].value}:{ok:false,error:'Feedet kunne ikke hentes, valideres eller gemmes. Tidligere data er bevaret.'}]));
}
