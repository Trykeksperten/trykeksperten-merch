// IPC harness only; server.mjs has no test routes or load-test controls.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {customerProofView} from '../lib/customer-proof-view.mjs';
import {runFileTask,fileProcessingStatus} from '../lib/file-process.mjs';
const root=process.env.SMERCH_LOAD_ROOT;
if(!root||!process.send||process.env.PF_GATEWAY_MODE!=='test'||JSON.parse(await readFile(join(root,'synthetic-load.json'),'utf8')).syntheticOnly!==true)throw Error('Synthetic IPC harness required.');
const cgroupPath=process.platform==='linux'?(await readFile('/proc/self/cgroup','utf8')).split('\n').find(s=>s.startsWith('0::'))?.slice(3):null;
const lag=monitorEventLoopDelay({resolution:20});lag.enable();let peakRSS=0,maxQueued=0;
const sampler=setInterval(()=>{peakRSS=Math.max(peakRSS,process.memoryUsage().rss);maxQueued=Math.max(maxQueued,fileProcessingStatus().queued);},20);sampler.unref();
await import('../server.mjs');
const allowed=new Set(['normal','dense','multi','large','invalid','pages','oversized']);
process.on('message',async({id,kind,fixture,reference})=>{
 try{
  if(kind==='state'){process.send({id,ok:true,cgroupPath,peakRSS,rss:process.memoryUsage().rss,heapUsed:process.memoryUsage().heapUsed,maxQueued,queue:fileProcessingStatus(),eventLoopP99Ms:lag.percentile(99)/1e6,eventLoopMaxMs:lag.max/1e6});return;}
  if(!allowed.has(fixture)||!['render','pdf','extract'].includes(kind)||typeof reference!=='string'||reference.length>100)throw Error('Invalid synthetic job.');
  const bytes=await readFile(join(root,'fixtures',fixture+'.pdf')),hash=createHash('sha256').update(bytes).digest('hex'),started=performance.now();
  const result=kind==='render'?(await customerProofView({mimeType:'application/pdf',data:bytes},reference)).data:await runFileTask(kind,{files:[{bytes,mimeType:'application/pdf'}]});
  if(createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Synthetic original changed.');
  process.send({id,ok:true,ms:performance.now()-started,bytes:Buffer.isBuffer(result)?result.length:0,pages:result?.pages||null,originalUnchanged:true});
 }catch(error){process.send({id,ok:false,code:error.code||'HARNESS_FAILED',resources:error.fileDiagnostics||null});}
});
