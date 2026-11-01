import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';import {once} from 'node:events';import {createServer} from 'node:net';import {request} from 'node:http';import {scryptSync} from 'node:crypto';
test('actual HTTP server drains an active request, blocks new work, keeps health online and resumes normal authentication',async()=>{
 const root=await mkdtemp(join(tmpdir(),'smerch-backup-http-')),source=join(root,'data');await mkdir(source);
 const portProbe=createServer();await new Promise(r=>portProbe.listen(0,'127.0.0.1',r));const port=portProbe.address().port;await new Promise(r=>portProbe.close(r));const base=`http://127.0.0.1:${port}`,salt='11'.repeat(16),hash=scryptSync('synthetic-password',Buffer.from(salt,'hex'),64).toString('hex');
 const child=spawn(process.execPath,['--import',fileURLToPath(new URL('../scripts/test-local-fetch-only.mjs',import.meta.url)),fileURLToPath(new URL('./helpers/backup-http-server.mjs',import.meta.url))],{cwd:root,env:{PATH:process.env.PATH,NODE_ENV:'production',HOST:'127.0.0.1',PORT:String(port),PF_GATEWAY_MODE:'test',SMERCH_DATA_DIR:source,SMERCH_BACKUP_ENABLED:'1',SMERCH_BACKUP_TRANSFER_APPROVED:'1',SMERCH_BACKUP_SINGLE_WRITER_CONFIRMED:'1',SMERCH_BACKUP_WORK_DIR:join(root,'work'),SMERCH_BACKUP_CERTIFICATE:join(root,'synthetic-only.pem'),SMERCH_BACKUP_CERT_SHA256:'c'.repeat(64),SMERCH_BACKUP_CREDENTIALS:join(root,'synthetic-only.json'),SMERCH_BACKUP_B2_ACCOUNT_ID:'a'.repeat(12),SMERCH_BACKUP_B2_BUCKET_ID:'b'.repeat(24),SMERCH_ADMIN_USERNAME:'test',SMERCH_ADMIN_PASSWORD_HASH:salt+':'+hash},stdio:['ignore','pipe','pipe','ipc']});
 const queues=new Map(),waiters=new Map();child.on('message',m=>{const waiting=waiters.get(m.type);if(waiting){waiters.delete(m.type);waiting(m);}else{const q=queues.get(m.type)||[];q.push(m);queues.set(m.type,q);}});
 const message=type=>{const q=queues.get(type);if(q?.length)return Promise.resolve(q.shift());return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waiters.delete(type);reject(Error('IPC timeout: '+type));},10000);waiters.set(type,v=>{clearTimeout(timer);resolve(v);});});};
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Synthetic server failed');})]);
  let responseRequest;const response=new Promise((resolve,reject)=>{const req=request(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'}},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});req.once('error',reject);req.write('{"username":');responseRequest=req;});
  let state;do{child.send('state');state=await message('state');if(!state.active)await new Promise(r=>setImmediate(r));}while(!state.active);
  child.send('freeze');await message('freeze-started');child.send('state');state=await message('state');assert.equal(state.paused,true);assert.ok(state.active>0);
  responseRequest.end('"wrong","password":"wrong"}');assert.equal(await response,401);await message('frozen');
  assert.equal((await fetch(base+'/health')).status,200);
  const blocked=await fetch(base+'/api/quickpay/callback',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(blocked.status,503);assert.equal(blocked.headers.get('retry-after'),'5');
  assert.equal((await fetch(base+'/')).status,503);child.send('background');assert.deepEqual((await message('background')).result,{skipped:true});
  child.send('thaw');await message('thawed');assert.equal((await fetch(base+'/api/admin/operations')).status,401);assert.equal((await fetch(base+'/api/checkout/status')).status,200);
 }finally{
  if(child.exitCode===null&&child.signalCode===null){child.send('thaw');const done=once(child,'exit');child.kill('SIGTERM');await done;}
  await rm(root,{recursive:true,force:true});
 }
});
