import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {createHash} from 'node:crypto';
const fallback={version:1,status:'manual',codes:[]};
let active=0;
export async function inspectArtworkPantone(bytes){
 if(!bytes?.length||bytes.length>5*1024*1024||active>=2)return {...fallback};
 active++;
 try{return await new Promise(resolve=>{
  const worker=new Worker(new URL(import.meta.url),{workerData:bytes,resourceLimits:{maxOldGenerationSizeMb:96,maxYoungGenerationSizeMb:16}});
  let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);worker.terminate();resolve({...value,sha256:createHash('sha256').update(bytes).digest('hex')});};
  const timer=setTimeout(()=>finish(fallback),3000);
  worker.once('message',finish);worker.once('error',()=>finish(fallback));worker.once('exit',()=>finish(fallback));
 });}finally{active--;}
}
if(!isMainThread){
 try{const {parseArtworkPantone}=await import('./artwork-pantone-parser.mjs');parentPort.postMessage(await parseArtworkPantone(workerData));}catch{parentPort.postMessage(fallback);}
}
export function decorationPantone(decoration,assets=[]){
 const files=(decoration.artworks||[]).map(art=>assets.find(file=>file.id===art.logo.id)?.pantone);
 const codes=[...new Set(files.flatMap(file=>file?.codes||[]))].sort();
 const verified=!decoration.text?.trim()&&files.length>0&&files.every(file=>file?.version===1&&file.status==='verified'&&file.sha256)&&codes.length===Number(decoration.colors);
 return {status:verified?'verified':'manual',codes};
}
