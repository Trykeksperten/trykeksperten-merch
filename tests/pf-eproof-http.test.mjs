import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,scryptSync} from 'node:crypto';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {proofPdf} from './helpers/proof-pdf.mjs';
test('PF callback requires dedicated auth; outbound requires staff session and origin',async()=>{
 const root=await mkdtemp(join(tmpdir(),'eproof-http-')),id='ord-'+randomUUID(),po='SMERCH-'+id.slice(4);
 await mkdir(join(root,'orders'));await writeFile(join(root,'orders',id+'.json'),JSON.stringify({id,purchaseOrderNumber:po,pfOrderNumber:123,status:'awaiting_proof',gatewayPayload:{Header:{isTest:true}},lines:[{sku:'TEST',decorations:[]}],events:[],proofs:[]}));
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const salt='11'.repeat(16),hash=scryptSync('test-password',Buffer.from(salt,'hex'),64).toString('hex');
 const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{cwd:root,env:{PATH:process.env.PATH,NODE_ENV:'production',PORT:String(port),HOST:'127.0.0.1',SMERCH_DATA_DIR:root,SMERCH_PUBLIC_BASE_URL:`http://127.0.0.1:${port}`,SMERCH_ADMIN_USERNAME:'test',SMERCH_ADMIN_PASSWORD_HASH:salt+':'+hash,PF_ORDER_ADMIN_TOKEN:'admin-test-token',PF_EPROOF_ENABLED:'1',PF_EPROOF_MODE:'test',PF_EPROOF_EXPECTED_SENDER_ID:'PF',PF_EPROOF_CALLBACK_USERNAME:'pf',PF_EPROOF_CALLBACK_PASSWORD:'x'.repeat(32)},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Startup failed');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Startup timeout')),10000).unref())]);
  const base=`http://127.0.0.1:${port}`,payload={Eproof:[{SenderId:'PF',PoNumber:po,SoNumber:123,'Url-Eproof':'http://172.17.45.10/proof',Base64Image:(await proofPdf()).toString('base64'),configuration:[{EproofRef:'TEST-1',SKUs:[{sku:'TEST',lineReference:'123_1'}]}]}]};
  const post=(url,headers,body=payload)=>fetch(base+url,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await post('/api/pf-eproof',{})).status,401);
  assert.equal((await post('/api/pf-eproof',{authorization:'Bearer admin-test-token'})).status,401);
  const callback={authorization:'Basic '+Buffer.from('pf:'+'x'.repeat(32)).toString('base64')};
  const probe=await post('/api/pf-eproof',callback,{});assert.equal(probe.status,200);assert.deepEqual(await probe.json(),{authenticated:true,connectionTest:true,received:false,message:'Connection successful. No e-proof was submitted.'});
  assert.equal((await post('/api/pf-eproof',{authorization:'Basic '+Buffer.from('wrong:'+'x'.repeat(32)).toString('base64')},{})).status,401);
  assert.equal((await post('/api/pf-eproof',callback)).status,200);
  assert.equal((await(await post('/api/pf-eproof',callback)).json()).results[0].duplicate,true);
  assert.equal((await fetch(base+'/api/pf-orders/eproof-status')).status,401);
  const path='/api/pf-orders/'+id+'/eproof-send';assert.equal((await post(path,{},{})).status,401);
  const bearer=await post(path,{authorization:'Bearer admin-test-token'},{});assert.notEqual(bearer.status,200);
  const login=await post('/api/admin/login',{}, {username:'test',password:'test-password'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];const readinessResponse=await fetch(base+'/api/pf-orders/eproof-status',{headers:{cookie}});assert.equal(readinessResponse.status,200);const readiness=await readinessResponse.json();assert.equal(readiness.mode,'test');assert.equal(readiness.ready,false);assert.ok(readiness.missing.includes('PF_GATEWAY_USERNAME'));assert.ok(!JSON.stringify(readiness).includes('x'.repeat(32)));
  assert.equal((await post(path,{cookie,origin:'https://wrong.test','x-smerch-admin':'1'},{})).status,401);
  const result=await post(path,{cookie,origin:base,'x-smerch-admin':'1'}, {version:1,confirmed:true});assert.equal(result.status,400);assert.match((await result.json()).error,/konfigureret|bruger|Sender-id/);
  const stored=JSON.parse(await readFile(join(root,'orders',id+'.json')));assert.equal(stored.proof.version,1);assert.equal(stored.decision,null);
 }finally{if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}await rm(root,{recursive:true,force:true});}
});

test('connection-only mode returns 200 for valid login and 503 for every proof notification',async()=>{
 const root=await mkdtemp(join(tmpdir(),'eproof-connect-')),probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{cwd:root,env:{PATH:process.env.PATH,NODE_ENV:'production',PORT:String(port),HOST:'127.0.0.1',SMERCH_DATA_DIR:root,PF_EPROOF_MODE:'test',PF_EPROOF_CALLBACK_USERNAME:'pf-eproof-smerch',PF_EPROOF_CALLBACK_PASSWORD:'x'.repeat(32)},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Startup failed');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Startup timeout')),10000).unref())]);
  const url=`http://127.0.0.1:${port}/api/pf-eproof`,auth='Basic '+Buffer.from('pf-eproof-smerch:'+'x'.repeat(32)).toString('base64');
  const post=(body,authorization=auth)=>fetch(url,{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify(body)});
  for(const probe of [{},{connectionTest:true}]){const response=await post(probe);assert.equal(response.status,200);assert.equal((await response.json()).received,false);}
  assert.equal((await fetch(url,{method:'POST',headers:{authorization:auth}})).status,200);
  assert.equal((await post({},'Basic '+Buffer.from('pf-smerch:'+'x'.repeat(32)).toString('base64'))).status,401);
  assert.equal((await post({},'Basic '+Buffer.from('pf-eproof-smerch:wrong').toString('base64'))).status,401);
  for(const payload of [{Eproof:[]},{connectionTest:true,Eproof:[{}]},{other:true}]){const response=await post(payload);assert.equal(response.status,503);const body=await response.json();assert.equal(body.authenticated,true);assert.equal(body.received,false);}
  await assert.rejects(readFile(join(root,'orders','unexpected.json')),{code:'ENOENT'});
 }finally{if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}await rm(root,{recursive:true,force:true});}
});
