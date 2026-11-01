import {spawn} from 'node:child_process';
import {serialize,deserialize} from 'node:v8';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const MiB=1024*1024;
const policies=Object.freeze({pantone:{input:5*MiB,output:64*1024,ms:3000},extract:{input:10*MiB,output:2*MiB,ms:20000},render:{input:15*MiB,output:24*MiB,ms:60000},pdf:{input:10*MiB,output:1024,ms:10000},image:{input:10*MiB,output:1024,ms:10000},merge:{input:20*MiB,output:24*MiB,ms:20000}});
const messages={FILE_ACTIVE:'Aktivt indhold og indlejrede filer er ikke tilladt.',FILE_PIXELS:'Billedet må højst være 40 megapixel.',FILE_PAGES:'Korrekturen skal indeholde 1–40 sider.'};
const error=(code='FILE_PROCESS_FAILED')=>Object.assign(Error(messages[code]||'Filen kunne ikke behandles sikkert. Prøv igen eller kontakt Smerch.'),{code});
const base=fileURLToPath(new URL('../',import.meta.url));
// One process and one bounded waiting job across ALL parser callers.
export function createFileProcessRunner({entry=new URL('./file-process-child.mjs',import.meta.url),timeoutMs,queueMs=5000}={}){
 if(timeoutMs!==undefined&&(!Number.isSafeInteger(timeoutMs)||timeoutMs<25||timeoutMs>60000)||!Number.isSafeInteger(queueMs)||queueMs<1||queueMs>5000)throw error('FILE_TASK_INVALID');
 let active=false;const queue=[];
 function start(row){
  active=true;clearTimeout(row.queueTimer);
  execute(row).then(row.resolve,row.reject).finally(()=>{active=false;const next=queue.shift();if(next)start(next);});
 }
 async function execute({task,payload,policy}){
  const packet=serialize(payload);if(packet.length>policy.input+8192)throw error('FILE_INPUT_LIMIT');
  const libs=realpathSync(fileURLToPath(new URL('./',import.meta.url))),modules=realpathSync(fileURLToPath(new URL('../node_modules/',import.meta.url)));
  const args=['--expose-gc','--jitless','--max-old-space-size=64','--v8-pool-size=1','--permission','--allow-addons','--allow-fs-read='+libs,'--allow-fs-read='+modules,'--allow-fs-read='+base+'node_modules','--allow-fs-read='+base+'package.json',fileURLToPath(entry)];
  // Test fixtures may use their own entry file; no HTTP caller can select this.
  if(!fileURLToPath(entry).startsWith(libs+'/'))args.splice(-1,0,'--allow-fs-read='+fileURLToPath(entry));
  const env={PATH:process.env.PATH||'/usr/local/bin:/usr/bin:/bin',UV_THREADPOOL_SIZE:'1',MALLOC_ARENA_MAX:'1',DISABLE_SYSTEM_FONTS_LOAD:'1'};
  return new Promise((resolve,reject)=>{
   let child,issue,bytes=0,stdout=[];
   const stop=code=>{issue||=code;child?.kill('SIGKILL');};
   try{child=process.platform==='linux'?spawn('python3',['-I','-S',fileURLToPath(new URL('./file-process-limit.py',import.meta.url)),process.execPath,...args],{cwd:base,env,stdio:['pipe','pipe','ignore']}):spawn(process.execPath,args,{cwd:base,env,stdio:['pipe','pipe','ignore']});}catch{reject(error());return;}
   const timer=setTimeout(()=>stop('FILE_PROCESS_TIMEOUT'),timeoutMs||policy.ms);
   child.once('error',()=>{issue||='FILE_PROCESS_FAILED';});child.stdin.on('error',()=>{});
   child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>policy.output+8192)stop('FILE_OUTPUT_LIMIT');else stdout.push(chunk);});
   child.once('close',(code,signal)=>{
    clearTimeout(timer);
    // Admission is released only after the child and its pipe have actually closed.
    if(issue||code!==0){const failure=error(issue);failure.fileDiagnostics={stage:'process_exit',signal:signal||null};reject(failure);return;}
    try{const result=deserialize(Buffer.concat(stdout));if(result?.ok!==true){const failure=error(Object.hasOwn(messages,result?.code)?result.code:undefined);if(result?.diagnostic)failure.fileDiagnostics=result.diagnostic;throw failure;}const value=result.value;if(['render','merge'].includes(task)&&(!Buffer.isBuffer(value)||value.length>policy.output||!value.length))throw error();if(task==='extract'&&(typeof value!=='string'||Buffer.byteLength(value)>policy.output))throw error();
     if(['render','merge'].includes(task)&&value.subarray(0,5).toString()!=='%PDF-')throw error();
     if(task==='pdf'&&(!Number.isInteger(value?.pages)||value.pages<1||value.pages>payload.maxPages))throw error();
     if(task==='image'&&(!Number.isInteger(value?.width)||!Number.isInteger(value?.height)||value.width<1||value.height<1||value.width*value.height>40000000))throw error();
     if(task==='pantone'&&(value?.version!==1||!['manual','verified'].includes(value.status)||!Array.isArray(value.codes)||value.codes.length>256||value.codes.some(c=>typeof c!=='string'||c.length>80)))throw error();
     resolve(value);}catch(e){reject(e?.code?.startsWith('FILE_')?e:error());}
   });
   child.stdin.end(packet);
  });
 }
 return {status:()=>({active,queued:queue.length,processIsolation:true,linuxLimitsRequired:process.platform==='linux'}),run(task,input={}){
  const policy=Object.hasOwn(policies,task)?policies[task]:null;if(!policy)return Promise.reject(error('FILE_TASK_INVALID'));
  const files=input?.files;if(!Array.isArray(files)||!files.length||files.length>(task==='merge'?20:1)||files.some(f=>!Buffer.isBuffer(f?.bytes)||!f.bytes.length||!['application/pdf','image/png','image/jpeg','application/postscript'].includes(f.mimeType)))return Promise.reject(error('FILE_INPUT_LIMIT'));
  if(files.reduce((n,f)=>n+f.bytes.length,0)>policy.input||typeof input.reference!=='undefined'&&(typeof input.reference!=='string'||input.reference.length>200)||input.maxPages!==undefined&&(!Number.isInteger(input.maxPages)||input.maxPages<1||input.maxPages>200))return Promise.reject(error('FILE_INPUT_LIMIT'));
  if(active&&queue.length>=1)return Promise.reject(error('FILE_PROCESS_BUSY'));
  const payload={task,files,reference:input.reference,active:input.active===true,maxPages:input.maxPages||40};
  return new Promise((resolve,reject)=>{const row={task,payload,policy,resolve,reject};if(!active)start(row);else{row.queueTimer=setTimeout(()=>{const index=queue.indexOf(row);if(index>=0){queue.splice(index,1);reject(error('FILE_PROCESS_BUSY'));}},queueMs);queue.push(row);}});
 }};
}
const shared=createFileProcessRunner();
export const runFileTask=(task,input)=>shared.run(task,input);
export const fileProcessingStatus=()=>shared.status();
