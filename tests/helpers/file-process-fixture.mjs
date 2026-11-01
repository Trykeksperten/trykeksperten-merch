import {serialize,deserialize} from 'node:v8';
import {readFileSync} from 'node:fs';
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);const request=deserialize(Buffer.concat(chunks));
let value={pages:1};
if(request.reference==='hang'){setInterval(()=>{},1000);}
else{
 if(request.reference==='environment')value=JSON.stringify({environmentKeys:Object.keys(process.env).sort(),marker:process.env.SMERCH_SYNTHETIC_SECRET||null});
 else if(request.reference?.startsWith('read:')){let denied=false;try{readFileSync(request.reference.slice(5));}catch(e){denied=e.code==='ERR_ACCESS_DENIED';}value=JSON.stringify({denied});}
 else if(request.reference==='allocate'){let denied=false;try{Buffer.alloc(1024*1024*1024);}catch{denied=true;}value=JSON.stringify({denied,maxRSSKiB:process.resourceUsage().maxRSS});}
 else if(request.reference==='native'){const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);let denied=false;try{const {createCanvas}=require('@napi-rs/canvas');const canvas=createCanvas(20000,20000);canvas.getContext('2d').fillRect(0,0,20000,20000);}catch{denied=true;}value=JSON.stringify({denied});}
 else if(request.reference==='overflow')value='x'.repeat(3*1024*1024);
 else if(request.reference==='invalid')value={pages:0};
 const output=serialize({ok:true,value});process.stdout.end(output,()=>process.exit(0));
}
