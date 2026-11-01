import {runFileTask} from './file-process.mjs';
import {createHash} from 'node:crypto';
const fallback={version:1,status:'manual',codes:[]};
export async function inspectArtworkPantone(bytes){
 if(!bytes?.length||bytes.length>5*1024*1024)return {...fallback};
 const sha256=createHash('sha256').update(bytes).digest('hex');
 try{return {...await runFileTask('pantone',{files:[{bytes:Buffer.from(bytes),mimeType:'application/pdf'}]}),sha256};}catch{return {...fallback,sha256};}
}
export function decorationPantone(decoration,assets=[]){
 const files=(decoration.artworks||[]).map(art=>assets.find(file=>file.id===art.logo.id)?.pantone);
 const codes=[...new Set(files.flatMap(file=>file?.codes||[]))].sort();
 const verified=!decoration.text?.trim()&&files.length>0&&files.every(file=>file?.version===1&&file.status==='verified'&&file.sha256)&&codes.length===Number(decoration.colors);
 return {status:verified?'verified':'manual',codes};
}
