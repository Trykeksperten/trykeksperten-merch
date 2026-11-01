// Binary IPC only. No .env, application state, provider credentials or network access.
import {serialize,deserialize} from 'node:v8';
import {readFileSync} from 'node:fs';
for(const key of ['log','warn','error','info','debug'])console[key]=()=>{};
globalThis.fetch=()=>Promise.reject(Error('File process network disabled.'));
let chunks=[],size=0,stage='request';
try{
 for await(const chunk of process.stdin){size+=chunk.length;if(size>20*1024*1024+8192)throw Error();chunks.push(chunk);}
 const {task,files,reference,active,maxPages}=deserialize(Buffer.concat(chunks));chunks=null;
 let value;
 if(task==='pantone'){const {parseArtworkPantone}=await import('./artwork-pantone-parser.mjs');value=await parseArtworkPantone(files[0].bytes);}
 else if(task==='extract'){const {extractProofPDFText}=await import('./pf-proof-pdf-worker.mjs');value=await extractProofPDFText(files[0].bytes);}
 else if(task==='render'){const {buildCustomerProofPDF}=await import('./customer-proof-layout-worker.mjs');value=Buffer.from(await buildCustomerProofPDF({bytes:files[0].bytes,reference},name=>{stage=name;}));}
 else {const {inspectPDF,inspectImage,mergeProofFiles}=await import('./file-process-formats.mjs');if(task==='pdf')value=await inspectPDF(files[0].bytes,{active,maxPages});else if(task==='image')value=await inspectImage(files[0]);else if(task==='merge')value=await mergeProofFiles(files);else throw Error();}
 const result=serialize({ok:true,value});if(result.length>24*1024*1024+8192)throw Error();process.stdout.end(result,()=>process.exit(0));
}catch(e){const memory=process.memoryUsage();let virtual={};if(process.platform==='linux')try{const status=readFileSync('/proc/self/status','utf8');for(const field of ['VmSize','VmData','VmStk'])virtual[field+'KiB']=Number(new RegExp('^'+field+':\\s+(\\d+)','m').exec(status)?.[1]||0);}catch{};const reasons=new Set(['Invalid text geometry','Too many pages','Missing reference','Image-only page cannot be checked','Reference label without matching order reference','Reference shares a text object with other proof details','Company name shares a text object with other proof details','Non-opaque customer copy','Page pixel limit exceeded','Customer copy size limit exceeded']);const diagnostic={stage,...virtual,heapTotal:memory.heapTotal,errorCode:/^[A-Z0-9_]{1,64}$/.test(e.code||'')?e.code:null,reason:reasons.has(e.message)?e.message:null,kind:/memory|alloc|buffer/i.test(String(e.message))?'allocation':'parse_or_render',rss:memory.rss,heapUsed:memory.heapUsed,external:memory.external};process.stdout.end(serialize({ok:false,diagnostic,code:['FILE_ACTIVE','FILE_PIXELS','FILE_PAGES'].includes(e.code)?e.code:'FILE_PROCESS_FAILED'}),()=>process.exit(0));}
