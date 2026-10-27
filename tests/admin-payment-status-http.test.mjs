import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,scryptSync} from 'node:crypto';
import {once} from 'node:events';
import {createServer} from 'node:net';

test('admin payment controls work on the API host with a separate storefront and reject foreign origins',async()=>{
 const root=await mkdtemp(join(tmpdir(),'smerch-admin-payment-http-')),id='pay-'+randomUUID();
 await mkdir(join(root,'checkouts'));
 await writeFile(join(root,'checkouts',id+'.json'),JSON.stringify({id,paymentProvider:'bank_transfer',status:'awaiting_bank_payment',createdAt:new Date().toISOString(),totalIncVat:500000,bankPayment:{invoiceNumber:null,receipts:[]},lines:[],events:[]}));
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const base=`http://127.0.0.1:${port}`,salt='22'.repeat(16),password='isolated-test-password',hash=scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex');
 const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{cwd:root,env:{PATH:process.env.PATH,NODE_ENV:'production',PORT:String(port),HOST:'127.0.0.1',SMERCH_DATA_DIR:root,SMERCH_PUBLIC_BASE_URL:base,SMERCH_CUSTOMER_BASE_URL:'https://shop.example.test',SMERCH_ADMIN_USERNAME:'test',SMERCH_ADMIN_PASSWORD_HASH:salt+':'+hash,PF_AUTO_SUBMIT_ENABLED:'0',QUICKPAY_CAPTURE_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Startup failed');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Timeout')),10000).unref())]);
  const path=base+'/api/admin/checkouts/'+id;
  assert.equal((await fetch(path+'/payment-status',{method:'POST'})).status,401);
  const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'test',password})});assert.equal(login.status,200);
  const headers={cookie:login.headers.get('set-cookie').split(';')[0],'content-type':'application/json','x-smerch-admin':'1',origin:base};
  const post=(suffix,body={},extra={})=>fetch(path+suffix,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body)});
  for(const origin of ['https://evil.test','https://shop.example.test']){
   assert.equal((await post('/payment-status',{}, {origin})).status,401);
   assert.equal((await post('/bank-payment',{action:'invoice',invoiceNumber:'TEST-100'},{origin})).status,403);
  }
  const check=await post('/payment-status');assert.equal(check.status,400);assert.match((await check.json()).error,/kun Quickpay/);
  const review=await post('/approve-handoff',{confirmed:false});assert.equal(review.status,400);assert.match((await review.json()).error,/Bekræft gennemgangen/);
  const invoice=await post('/bank-payment',{action:'invoice',invoiceNumber:'TEST-100'});assert.equal(invoice.status,200);assert.equal((await invoice.json()).bankPayment.invoiceNumber,'TEST-100');
  const list=await(await fetch(base+'/api/admin/checkouts',{headers})).json();assert.equal(list[0].status,'awaiting_bank_payment');assert.equal(list[0].paymentCheckedAt,null);assert.deepEqual(list[0].pfOrderIds,[]);
  const cardId='pay-'+randomUUID(),authorizedAt='2026-10-20T10:00:00.000Z',authorizationExpiresAt='2027-04-17T10:00:00.000Z';
  await writeFile(join(root,'checkouts',cardId+'.json'),JSON.stringify({id:cardId,paymentProvider:'quickpay',status:'authorized',createdAt:authorizedAt,authorizedAt,authorizationExpiresAt,captureDeadlinePolicy:'clearhaus-179-days',paymentTotals:{captured:0,refunded:0},totalIncVat:10000,lines:[],events:[]}));
  const cards=await(await fetch(base+'/api/admin/checkouts',{headers})).json(),card=cards.find(c=>c.id===cardId);
  assert.equal(card.captureDeadlinePolicy,'clearhaus-179-days');assert.equal(card.authorizationExpiresAt,authorizationExpiresAt);assert.deepEqual(card.paymentTotals,{captured:0,refunded:0});
 }finally{
  if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}
  await rm(root,{recursive:true,force:true});
 }
});
