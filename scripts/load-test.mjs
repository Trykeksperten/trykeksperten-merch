// Run against a private synthetic copy. Linux acceptance requires a real 512 MiB cgroup.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {networkInterfaces} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
const root=resolve(process.argv[2]||''),local=process.argv.includes('--local'),manifest=JSON.parse(await readFile(join(root,'synthetic-load.json'),'utf8'));
assert.equal(manifest.syntheticOnly,true);assert.equal(await readFile(join(root,'app/.env')).then(()=>true,()=>false),false);
let cg;
if(!local){assert.equal(process.platform,'linux');const line=(await readFile('/proc/self/cgroup','utf8')).split('\n').find(s=>s.startsWith('0::'));assert.ok(line,'cgroup v2 required');cg='/sys/fs/cgroup'+line.slice(3);assert.equal(Number(await readFile(join(cg,'memory.max'),'utf8')),512*1024*1024);assert.equal(Number(await readFile(join(cg,'memory.swap.max'),'utf8')),0);const [quota,period]=(await readFile(join(cg,'cpu.max'),'utf8')).trim().split(' ').map(Number);assert.equal(quota/period,1);assert.ok(Object.values(networkInterfaces()).flat().every(a=>a.internal),'loopback-only network required');}
const memory=async()=>cg?{current:Number(await readFile(join(cg,'memory.current'),'utf8')),peak:Number(await readFile(join(cg,'memory.peak'),'utf8')),events:Object.fromEntries((await readFile(join(cg,'memory.events'),'utf8')).trim().split('\n').map(s=>s.split(' ')).map(([k,v])=>[k,Number(v)]))}:null;
const result={version:1,sourceCommit:manifest.sourceCommit,platform:process.platform,hard512MiBCgroup:!local,cpuQuota:'one CPU in Linux workflow',syntheticOnly:true,productionContacted:false,phases:[],startedAt:new Date().toISOString()};
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const base='http://127.0.0.1:'+port;
const env={PATH:process.env.PATH,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),PF_GATEWAY_MODE:'test',SMERCH_DATABASE_ENABLED:'0',SMERCH_BACKUP_ENABLED:'0',SMERCH_DATA_DIR:join(root,'runtime'),SMERCH_LOAD_ROOT:root};
const child=spawn(process.execPath,['--import',join(root,'app/scripts/test-local-fetch-only.mjs'),join(root,'app/scripts/load-test-server.mjs')],{cwd:join(root,'app'),env,stdio:['ignore','pipe','pipe','ipc']});
let stdout='',stderr='',serial=0,exited=false;child.stdout.on('data',d=>{stdout=(stdout+d).slice(-4000);});child.stderr.on('data',d=>{stderr=(stderr+d).slice(-4000);});const pending=new Map();
child.on('exit',()=>{exited=true;for(const {reject,timer} of pending.values()){clearTimeout(timer);reject(Error('Synthetic web server exited.'));}pending.clear();});
child.on('message',m=>{const row=pending.get(m.id);if(row){clearTimeout(row.timer);pending.delete(m.id);row.resolve(m);}});
const rpc=(kind,fixture='normal',reference='SMERCH-synthetic')=>new Promise((resolve,reject)=>{if(exited)return reject(Error('Synthetic server is not running.'));const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Synthetic job deadline.'));},90000);pending.set(id,{resolve,reject,timer});child.send({id,kind,fixture,reference});});
let paths=['/health','/','/api/pf-catalog','/api/pf-stock','/api/checkout/status'];
const percentile=(rows,p)=>rows.slice().sort((a,b)=>a-b)[Math.min(rows.length-1,Math.floor(rows.length*p))]||0;
async function traffic(name,{clients=5,ms=12000,work=async()=>{}}={}){
 const start=performance.now(),until=start+ms,latency=[],health=[],statuses={},errors=[];let requests=0,working=true;
 const background=work().finally(()=>{working=false;});
 const pump=async client=>{let n=client;while(performance.now()<until||working){const path=client===0?'/health':paths[n++%paths.length],at=performance.now();try{const response=await fetch(base+path,{signal:AbortSignal.timeout(5000),headers:{'Accept-Encoding':n%2?'gzip':'identity'}});await response.arrayBuffer();statuses[response.status]=(statuses[response.status]||0)+1;assert.equal(response.status,200);const elapsed=performance.now()-at;latency.push(elapsed);if(path==='/health')health.push(elapsed);requests++;}catch(error){errors.push(error.name);break;}await delay(75);}};
 await Promise.all([background,...Array.from({length:clients},(_,i)=>pump(i))]);
 const state=await rpc('state'),row={name,clients,seconds:(performance.now()-start)/1000,requests,statuses,errors,p95Ms:percentile(latency,.95),maxMs:Math.max(0,...latency),healthP95Ms:percentile(health,.95),healthMaxMs:Math.max(0,...health),state,memory:await memory()};result.phases.push(row);console.log('SMERCH_LOAD_PHASE '+JSON.stringify(row));
 assert.equal(errors.length,0,name+' request failures');assert.ok(row.healthMaxMs<2000,name+' health exceeded 2 seconds');assert.ok(row.p95Ms<1500,name+' p95 exceeded 1.5 seconds');assert.equal(exited,false);assert.ok(state.maxQueued<=1);
}
let success=false;
try{
 for(let i=0;i<100;i++){if(exited)throw Error('Synthetic server startup failed.');try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(500)})).ok)break;}catch{}if(i===99)throw Error('Synthetic server startup timeout.');await delay(100);}
 const catalog=await(await fetch(base+'/api/pf-catalog')).json();assert.ok(catalog.products?.length>20);const products=catalog.products.slice(0,24).map(p=>'/api/pf-product/'+p.id);paths.push(...products);result.catalogProducts=catalog.products.length;
 await traffic('baseline',{clients:1,ms:5000});
 await traffic('15 browsing clients + sequential proof processing',{clients:15,ms:20000,work:async()=>{for(const [i,f] of ['normal','multi','dense'].entries()){const r=await rpc('render',f,'SMERCH-sequential-'+i);assert.equal(r.ok,true,JSON.stringify(r));result.phases.push({name:'proof-'+f,...r});}}});
 await traffic('8 distinct cached dense customer proofs',{clients:5,ms:12000,work:async()=>{for(let i=0;i<8;i++){const r=await rpc('render','dense','SMERCH-cache-'+i);assert.equal(r.ok,true,JSON.stringify(r));result.phases.push({name:'cache-fill-'+i,...r});}}});
 await traffic('12 simultaneous different proof jobs',{clients:10,ms:10000,work:async()=>{const rows=await Promise.all(Array.from({length:12},(_,i)=>rpc('render','normal','SMERCH-burst-'+i)));result.burst={accepted:rows.filter(r=>r.ok).length,busy:rows.filter(r=>r.code==='FILE_PROCESS_BUSY').length,other:rows.filter(r=>!r.ok&&r.code!=='FILE_PROCESS_BUSY')};assert.ok(result.burst.accepted>=1);assert.ok(result.burst.accepted<=2);assert.ok(result.burst.busy>=10);assert.equal(result.burst.other.length,0);}});
 await traffic('invalid and over-budget files; server recovery',{clients:5,ms:10000,work:async()=>{for(const f of ['invalid','pages','oversized']){const r=await rpc('pdf',f,'SMERCH-reject-'+f);assert.equal(r.ok,false,JSON.stringify(r));}const r=await rpc('render','large','SMERCH-large');result.largePage=r;if(!r.ok)assert.ok(['FILE_PROCESS_FAILED','FILE_PROCESS_TIMEOUT'].includes(r.code),JSON.stringify(r));const normal=await rpc('render','normal','SMERCH-after-rejections');assert.equal(normal.ok,true,JSON.stringify(normal));}});
 await traffic('warm browsing after cache and failures',{clients:15,ms:15000});
 result.memory=await memory();if(result.memory){assert.equal(result.memory.events.oom||0,0);assert.equal(result.memory.events.oom_kill||0,0);assert.ok(result.memory.peak<448*1024*1024,'Require 64 MiB headroom below the 512 MiB ceiling.');}
 success=true;
}catch(error){result.failure={message:error.message,serverExited:exited,stderr};result.memory=await memory().catch(()=>null);throw error;}
finally{result.success=success;result.finishedAt=new Date().toISOString();await writeFile(join(root,'result.json'),JSON.stringify(result,null,2)+'\n');console.log('SMERCH_LOAD_RESULT '+JSON.stringify(result));if(!exited){const done=once(child,'exit');child.kill('SIGTERM');await Promise.race([done,delay(5000).then(()=>{if(!exited)child.kill('SIGKILL');})]);}}
