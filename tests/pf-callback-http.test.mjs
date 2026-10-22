import test from 'node:test';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {Readable} from 'node:stream';
import {readPFCallback} from '../lib/pf-callback.mjs';
import {trackingEntries} from '../dist/shipment-tracking.mjs';
const credentials={PF_CALLBACK_USERNAME:'test-pf',PF_CALLBACK_PASSWORD:'local-test-password-only-32-characters',PF_GATEWAY_SENDER_ID:'TESTCUSTOMER'};
const auth='Basic '+Buffer.from(credentials.PF_CALLBACK_USERNAME+':'+credentials.PF_CALLBACK_PASSWORD).toString('base64');
const request=body=>Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]),{headers:{authorization:auth,'content-type':'application/json'}});
test('PF direct auth is opt-in and refuses wrong account or weak credentials',async()=>{
 const body={ShipmentNotification:{senderId:'PF',receiverId:'TESTCUSTOMER'}};
 await assert.rejects(readPFCallback(request(body),'shipment',{env:credentials}),/signatur/);
 await assert.rejects(readPFCallback(request(body),'shipment',{env:{...credentials,PF_CALLBACK_AUTH_MODE:'unexpected'}}),/signatur/);
 assert.deepEqual(await readPFCallback(request(body),'shipment',{env:{...credentials,PF_CALLBACK_AUTH_MODE:'basic'}}),body);
 await assert.rejects(readPFCallback(request({ShipmentNotification:{senderId:'PF',receiverId:'WRONG'}}),'shipment',{env:{...credentials,PF_CALLBACK_AUTH_MODE:'basic'}}),/Gateway/);
});
test('tracking links reject executable URLs and preserve valid PF HTTP tracking',()=>{
 assert.deepEqual(trackingEntries([{trackingId:'A',trackingURL:'javascript:alert(1)'},{trackingId:'B',trackingURL:'http://www.ups.com/track'},{trackingId:'C',trackingURL:'https://secret@example.com/'}]),[{trackingId:'A',trackingURL:null},{trackingId:'B',trackingURL:'http://www.ups.com/track'},{trackingId:'C',trackingURL:null}]);
});
test('real HTTP ASN receiver persists tracking for customer API without changing payment or sending PF orders',async()=>{
 const root=await mkdtemp(join(tmpdir(),'smerch-asn-http-')),uuid=randomUUID(),id='ord-'+uuid,pay='pay-'+randomUUID();
 await mkdir(join(root,'orders'));await mkdir(join(root,'checkouts'));
 const order={id,checkoutId:pay,purchaseOrderNumber:'SMERCH-'+uuid,pfOrderNumber:123,status:'confirmed',lines:[{sku:'test',quantity:1,decorations:[]}],events:[]};
 await writeFile(join(root,'orders',id+'.json'),JSON.stringify(order));
 await writeFile(join(root,'checkouts',pay+'.json'),JSON.stringify({id:pay,status:'authorized',totalIncVat:500,lines:order.lines,pfOrderIds:[id],events:[]}));
 // cwd is temporary and environment is allowlisted: no .env, API keys, SMTP,
 // payment provider or feed jobs from the developer's real environment.
 const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{cwd:root,env:{PATH:process.env.PATH,PORT:'5197',HOST:'127.0.0.1',SMERCH_DATA_DIR:root,PF_CALLBACK_AUTH_MODE:'basic',...credentials},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
 try{
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error(errors||'Server exited');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Server did not start')),10000).unref())]);
  const base='http://127.0.0.1:5197',notice={ShipmentNotification:{messageId:'test-asn-1',senderId:'PF',receiverId:'TESTCUSTOMER',deliveries:[{deliveryLocation:{customerPONumber:order.purchaseOrderNumber,isOrderComplete:false,carrier:'UPS',shipDate:'2026-10-22T10:00:00Z',trackAndTrace:[{trackingId:'TEST-123',trackingURL:'http://www.ups.com/track?trackNums=TEST-123'}]}}]}};
  const post=(headers,body=notice)=>fetch(base+'/api/pf-callback/shipment',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await post({})).status,401);
  assert.equal((await post({authorization:'Basic invalid'})).status,401);
  assert.equal((await post({authorization:auth},{ShipmentNotification:{...notice.ShipmentNotification,receiverId:'WRONG'}})).status,400);
  assert.equal((await post({authorization:auth})).status,200);
  assert.equal((await post({authorization:auth})).status,200);
  let view=await (await fetch(base+'/api/checkout/'+pay)).json();
  assert.equal(view.status,'authorized');assert.equal(view.totalIncVat,500);assert.equal(view.pfOrders[0].status,'partially_shipped');
  assert.equal(view.pfOrders[0].trackingDetails[0].trackingURL,'http://www.ups.com/track?trackNums=TEST-123');
  notice.ShipmentNotification.messageId='test-asn-2';notice.ShipmentNotification.deliveries[0].deliveryLocation.isOrderComplete=true;
  assert.equal((await post({authorization:auth})).status,200);
  view=await (await fetch(base+'/api/checkout/'+pay)).json();assert.equal(view.pfOrders[0].status,'shipped');assert.equal(view.status,'authorized');
  const stored=JSON.parse(await readFile(join(root,'orders',id+'.json')));assert.equal(stored.events.length,2);assert.equal(stored.gatewayResponse,undefined);
  const storedCheckout=JSON.parse(await readFile(join(root,'checkouts',pay+'.json')));assert.equal(storedCheckout.paidAt,undefined);assert.equal(storedCheckout.events.length,0);
 }finally{if(child.exitCode===null){const stopped=once(child,'exit');child.kill('SIGTERM');await stopped;}await rm(root,{recursive:true,force:true});}
});
