import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
// The approval hash still identifies the untouched supplier original.
// Only this customer view is rebuilt without the supplier's hidden PDF content.
const cache=new Map(),pending=new Map(),maxCachedBytes=32*1024*1024;
let cachedBytes=0,renderQueue=Promise.resolve();
const failure=()=>Error('Kundekopien af korrekturen kunne ikke klargøres sikkert. Smerch skal gennemgå filen, før den kan vises.');
export async function customerProofView(proof,reference){
 if(proof.mimeType!=='application/pdf')return proof;
 if(!reference||!proof.data?.length||proof.data.length>15*1024*1024)throw failure();
 const key=createHash('sha256').update('redacted-customer-copy-v2').update(proof.data).update(reference).digest('hex');
 if(cache.has(key))return {...proof,data:cache.get(key)};
 if(pending.has(key))return {...proof,data:await pending.get(key)};
 const task=renderQueue.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./customer-proof-layout-worker.mjs',import.meta.url),{workerData:{bytes:new Uint8Array(proof.data),reference},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256}});
  let settled=false;
  const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();error?reject(failure()):resolve(Buffer.from(value));};
  const timer=setTimeout(()=>done(true),60000);
  worker.once('message',result=>done(result.error||!result.data,result.data));worker.once('error',()=>done(true));worker.once('exit',()=>done(true));
 }));
 renderQueue=task.then(()=>{},()=>{});
 pending.set(key,task);
 try{
  const data=await task;
  while(cache.size&&(cache.size>=8||cachedBytes+data.length>maxCachedBytes)){const first=cache.keys().next().value;cachedBytes-=cache.get(first).length;cache.delete(first);}
  cache.set(key,data);cachedBytes+=data.length;return {...proof,data};
 }finally{pending.delete(key);}
}
