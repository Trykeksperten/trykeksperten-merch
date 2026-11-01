import {runFileTask} from './file-process.mjs';
import {createHash} from 'node:crypto';
// The approval hash still identifies the untouched supplier original.
// Only this customer view is rebuilt without the supplier's hidden PDF content.
const cache=new Map(),pending=new Map(),maxCachedBytes=32*1024*1024;
let cachedBytes=0;
const failure=()=>Error('Kundekopien af korrekturen kunne ikke klargøres sikkert. Smerch skal gennemgå filen, før den kan vises.');
export async function customerProofView(proof,reference){
 if(proof.mimeType!=='application/pdf')return proof;
 if(!reference||!proof.data?.length||proof.data.length>15*1024*1024)throw failure();
 const key=createHash('sha256').update('redacted-customer-copy-v3').update(proof.data).update(reference).digest('hex');
 if(cache.has(key))return {...proof,data:cache.get(key)};
 if(pending.has(key))return {...proof,data:await pending.get(key)};
 const task=runFileTask('render',{files:[{bytes:Buffer.from(proof.data),mimeType:'application/pdf'}],reference}).catch(error=>{const rejected=failure();rejected.code=error.code;rejected.fileDiagnostics=error.fileDiagnostics;throw rejected;});
 pending.set(key,task);
 try{
  const data=await task;
  while(cache.size&&(cache.size>=8||cachedBytes+data.length>maxCachedBytes)){const first=cache.keys().next().value;cachedBytes-=cache.get(first).length;cache.delete(first);}
  cache.set(key,data);cachedBytes+=data.length;return {...proof,data};
 }finally{pending.delete(key);}
}
