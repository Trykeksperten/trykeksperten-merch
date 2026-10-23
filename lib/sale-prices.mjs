import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {dataPath} from './data-path.mjs';
async function readStoredPrices(path=dataPath('sale-prices.json')){
 try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return {};throw error;}
}
function activeEntry(entry,now){
 while(entry&&!Array.isArray(entry)&&entry.expiresAt<=now)entry=entry.previous;
 return entry;
}
export async function readSalePriceState(path=dataPath('sale-prices.json'),now=Date.now()){
 const state=await readStoredPrices(path),prices={},expirations={};
 for(const [key,stored] of Object.entries(state)){const entry=activeEntry(stored,now),tiers=Array.isArray(entry)?entry:entry?.tiers;if(tiers)prices[key]=tiers;if(entry?.expiresAt)expirations[key]=entry.expiresAt;}
 return {prices,expirations};
}
export async function readSalePrices(path=dataPath('sale-prices.json'),now=Date.now()){return (await readSalePriceState(path,now)).prices;}
let pending=Promise.resolve();
export function saveSalePrices(sku,tiers,{path=dataPath('sale-prices.json'),minimum=1,clearSkus=[],productWide=false,durationMinutes=0,now=Date.now()}={}){
 if(![0,30,60].includes(durationMinutes)||!Number.isFinite(now))throw Error('Vælg permanent pris, 30 eller 60 minutter.');
 if(typeof sku!=='string'||!sku)throw Error('Vælg en variant.');
 if(tiers!==null&&(!Array.isArray(tiers)||!tiers.length||tiers.length>100||tiers[0].min!==minimum||tiers.some((t,i)=>!Number.isInteger(t.min)||t.min<1||t.min>100000||!Number.isSafeInteger(t.unitExVat)||t.unitExVat<1||t.unitExVat>100000000||(i&&t.min<=tiers[i-1].min))))throw Error('Angiv gyldige antalstrin og positive priser med højst to decimaler.');
 const job=pending.then(async()=>{const state=await readStoredPrices(path),expiresAt=durationMinutes?now+durationMinutes*60000:null;
 const assign=(key,value)=>{const previous=activeEntry(state[key],now)||null;if(expiresAt)state[key]={tiers:value,expiresAt,previous};else if(value===null)delete state[key];else state[key]=value;};
 for(const key of clearSkus)assign(key,null);
 assign(sku,tiers===null?null:tiers.map(({min,unitExVat},index)=>({min:productWide&&index===0?1:min,unitExVat})));await mkdir(dirname(path),{recursive:true,mode:0o700});const temp=`${path}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(state),{mode:0o600});await rename(temp,path);return readSalePrices(path,now);});pending=job.catch(()=>{});return job;
}
