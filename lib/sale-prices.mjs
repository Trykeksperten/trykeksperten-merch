import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {dataPath} from './data-path.mjs';
export async function readSalePrices(path=dataPath('sale-prices.json')){
 try{return JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return {};throw error;}
}
let pending=Promise.resolve();
export function saveSalePrices(sku,tiers,{path=dataPath('sale-prices.json'),minimum=1}={}){
 if(typeof sku!=='string'||!sku)throw Error('Vælg en variant.');
 if(tiers!==null&&(!Array.isArray(tiers)||!tiers.length||tiers.length>100||tiers[0].min!==minimum||tiers.some((t,i)=>!Number.isInteger(t.min)||t.min<1||t.min>100000||!Number.isSafeInteger(t.unitExVat)||t.unitExVat<1||t.unitExVat>100000000||(i&&t.min<=tiers[i-1].min))))throw Error('Angiv gyldige antalstrin og positive priser med højst to decimaler.');
 const job=pending.then(async()=>{const state=await readSalePrices(path);if(tiers===null)delete state[sku];else state[sku]=tiers.map(({min,unitExVat})=>({min,unitExVat}));await mkdir(dirname(path),{recursive:true,mode:0o700});const temp=`${path}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(state),{mode:0o600});await rename(temp,path);return state;});pending=job.catch(()=>{});return job;
}
