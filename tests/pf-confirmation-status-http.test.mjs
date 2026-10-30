import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createServer} from 'node:net';

test('PF confirmation and status HTTP callbacks: Basic Auth, PF example formats, deduplication, price and payment isolation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'smerch-pf-notifications-')),uuid=randomUUID(),id='ord-'+uuid,pay='pay-'+randomUUID(),reference='SMERCH-'+uuid;
 await mkdir(join(root,'orders'));await mkdir(join(root,'checkouts'));
 const order={id,checkoutId:pay,purchaseOrderNumber:reference,status:'gateway_accepted',lines:[{sku:'TEST',quantity:30,decorations:[]}],events:[]};
 const checkout={id:pay,status:'authorized',totalIncVat:12345,lines:order.lines,pfOrderIds:[id],events:[]};
 await writeFile(join(root,'orders',id+'.json'),JSON.stringify(order));await writeFile(join(root,'checkouts',pay+'.json'),JSON.stringify(checkout));
 const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const credentials={PF_CALLBACK_USERNAME:'test-pf',PF_CALLBACK_PASSWORD:'isolated-test-password-32-characters',PF_GATEWAY_SENDER_ID:'TESTCUSTOMER'};
 const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{cwd:root,env:{PATH:process.env.PATH,PORT:String(port),HOST:'127.0.0.1',SMERCH_DATA_DIR:root,PF_CALLBACK_AUTH_MODE:'basic',PF_AUTO_SUBMIT_ENABLED:'0',QUICKPAY_CAPTURE_ENABLED:'0',PF_GATEWAY_MODE:'test',...credentials},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error(errors||'Server exited');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Startup timeout')),10000).unref())]);
  const base=`http://127.0.0.1:${port}`,auth='Basic '+Buffer.from(credentials.PF_CALLBACK_USERNAME+':'+credentials.PF_CALLBACK_PASSWORD).toString('base64');
  const post=(kind,body,authorization=auth)=>fetch(`${base}/api/pf-callback/${kind}`,{method:'POST',signal:AbortSignal.timeout(5000),headers:{'content-type':'application/json',...(authorization?{authorization}:{})},body:JSON.stringify(body)});
  // Field names and envelopes follow Thomas's OrderConf_Example and OrderStatus_Example.
  const confirmation={messageId:'controlled-confirmation',receiverId:'TESTCUSTOMER',orderNumber:9999999,POreference:reference,currency:'EUR',subTotal:1,totalAmount:1,lines:[{item:'TEST',quantity:30,price:0.01,lineTotal:0.3}],delivery:{reference,order:9999999}};
  const status={StatusChangedNotification:{messageId:'controlled-status',senderId:'PF',receiverId:'TESTCUSTOMER',poNumber:reference,statusCode:'PROCESSING',statusInformation:'Controlled test',expectedShipDate:'2026-10-23T00:00:00.000Z'}};
  for(const [kind,body] of [['confirmation',confirmation],['status',status]]){
   assert.equal((await post(kind,body,null)).status,401);assert.equal((await post(kind,body,'Basic invalid')).status,401);
   const wrong=structuredClone(body);(kind==='status'?wrong.StatusChangedNotification:wrong).receiverId='OTHER';assert.equal((await post(kind,wrong)).status,400);
   assert.equal((await post(kind,body)).status,200);assert.equal((await post(kind,body)).status,200);
  }
  let stored=JSON.parse(await readFile(join(root,'orders',id+'.json')));
  assert.equal(stored.pfOrderNumber,9999999);assert.equal(stored.status,'processing');assert.equal(stored.pfStatus,'PROCESSING');assert.equal(stored.expectedShipDate,status.StatusChangedNotification.expectedShipDate);assert.equal(stored.events.length,2);assert.equal(stored.totalAmount,undefined);assert.equal(stored.currency,undefined);
  const view=await (await fetch(`${base}/api/checkout/${pay}`)).json();assert.equal(view.pfOrders[0].pfOrderNumber,undefined);assert.equal(view.pfOrders[0].totalAmount,undefined);assert.equal(view.pfOrders[0].status,'processing');assert.equal(view.totalIncVat,12345);
  const unknown={...confirmation,messageId:'unknown',POreference:'SMERCH-'+randomUUID(),delivery:undefined};assert.equal((await post('confirmation',unknown)).status,400);
  const conflict={...confirmation,messageId:'conflict',delivery:{reference:'SMERCH-'+randomUUID()}};assert.equal((await post('confirmation',conflict)).status,400);
  const badStatus=structuredClone(status);badStatus.StatusChangedNotification.messageId='bad-status';badStatus.StatusChangedNotification.statusCode='UNRECOGNISED';assert.equal((await post('status',badStatus)).status,400);
  // Processing must never release an unapproved decorated order.
  stored.lines[0].decorations=[{optionId:'test-front'}];stored.status='awaiting_proof';await writeFile(join(root,'orders',id+'.json'),JSON.stringify(stored));
  status.StatusChangedNotification.messageId='unapproved-processing';assert.equal((await post('status',status)).status,200);
  stored=JSON.parse(await readFile(join(root,'orders',id+'.json')));assert.equal(stored.status,'needs_attention');assert.equal(stored.gatewayResponse,undefined);
  assert.deepEqual(JSON.parse(await readFile(join(root,'checkouts',pay+'.json'))),checkout);assert.deepEqual((await readdir(root)).sort(),['checkouts','orders']);
 }finally{if(child.exitCode===null&&child.signalCode===null){const stopped=once(child,'exit');child.kill('SIGTERM');await stopped;}await rm(root,{recursive:true,force:true});}
});
