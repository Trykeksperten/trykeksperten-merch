import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';import {once} from 'node:events';import {createServer} from 'node:net';
async function server(t,proxyEnv={}){
 const root=await mkdtemp(join(tmpdir(),'smerch-client-ip-http-')),probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const base=`http://127.0.0.1:${port}`,child=spawn(process.execPath,['--import',fileURLToPath(new URL('../scripts/test-local-fetch-only.mjs',import.meta.url)),fileURLToPath(new URL('../server.mjs',import.meta.url))],{cwd:root,env:{PATH:process.env.PATH,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),SMERCH_DATA_DIR:root,PF_GATEWAY_MODE:'test',...proxyEnv},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}await rm(root,{recursive:true,force:true});});
 await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Synthetic server failed');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Startup timeout')),10000).unref())]);
 const contact=async(headers={})=>fetch(base+'/api/contact',{method:'POST',headers:{origin:base,'content-type':'application/json',...headers},body:JSON.stringify({name:'Synthetic only',email:'synthetic@example.invalid',subject:'Andet',message:'SYNTHETIC REQUEST - NO REAL MAIL',website:'honeypot'})});
 const login=async(headers={})=>fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json',...headers},body:'{"username":"synthetic-wrong","password":"synthetic-wrong"}'});
 return {contact,login};
}
test('real contact limiter cannot be bypassed by changing forwarded headers on an untrusted connection',async t=>{
 const app=await server(t);
 for(let i=0;i<5;i++)assert.equal((await app.contact({'x-forwarded-for':`198.51.100.${i+1}`,'cf-connecting-ip':`203.0.113.${i+1}`})).status,201);
 assert.equal((await app.contact({'x-forwarded-for':'192.0.2.99','cf-connecting-ip':'203.0.113.99'})).status,429);
});
test('explicit trusted proxy separates real clients while a forged XFF cannot reset contact or login counters',async t=>{
 const app=await server(t,{SMERCH_TRUSTED_PROXY_CIDRS:'127.0.0.1/32',SMERCH_CLIENT_IP_HEADER:'cf-connecting-ip'}),first={'cf-connecting-ip':'203.0.113.10'},second={'cf-connecting-ip':'203.0.113.11'};
 for(let i=0;i<5;i++)assert.equal((await app.contact({...first,'x-forwarded-for':`198.51.100.${i+1}`})).status,201);
 assert.equal((await app.contact(first)).status,429);assert.equal((await app.contact(second)).status,201);
 for(let i=0;i<5;i++)assert.equal((await app.login({...first,'x-forwarded-for':`198.51.100.${i+1}`})).status,401);
 assert.equal((await app.login(first)).status,429);assert.equal((await app.login(second)).status,401);
});
