import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {PDFDocument,rgb} from 'pdf-lib';
// A visual customer copy only. The supplier original and approval hash stay intact.
const cache=new Map();
export async function customerProofView(proof,reference){
 if(proof.mimeType!=='application/pdf'||!reference)return proof;
 const key=createHash('sha256').update(proof.data).update(reference).digest('hex');
 if(cache.has(key))return {...proof,data:cache.get(key)};
 const boxes=await new Promise(resolve=>{
  const worker=new Worker(new URL('./customer-proof-layout-worker.mjs',import.meta.url),{workerData:{bytes:new Uint8Array(proof.data),reference},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:128}});
  let settled=false;
  const done=value=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();resolve(value);};
  const timer=setTimeout(()=>done([]),20000);
  worker.once('message',result=>done(result.boxes||[]));worker.once('error',()=>done([]));worker.once('exit',()=>done([]));
 });
 if(!boxes.length)return proof;
 const pdf=await PDFDocument.load(proof.data);
 for(const {page,...box} of boxes)pdf.getPage(page).drawRectangle({...box,color:rgb(1,1,1),borderWidth:0});
 const data=Buffer.from(await pdf.save());if(cache.size>=8)cache.delete(cache.keys().next().value);cache.set(key,data);
 return {...proof,data};
}
