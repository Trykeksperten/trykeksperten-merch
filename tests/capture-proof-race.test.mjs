import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {persistCheckout,readCheckout,updateCheckout} from '../lib/checkout.mjs';
import {recordProof,readOrder,approveProofPayment} from '../lib/pf-orders.mjs';
import {captureApprovedCheckout,checkoutReadyForCapture} from '../lib/order-flow.mjs';
import {executeSalesPayment} from '../lib/sales-payments.mjs';
import {readLedger} from '../lib/sales-ledger.mjs';

const root=await mkdtemp(join(tmpdir(),'capture-proof-race-'));process.env.SMERCH_DATA_DIR=root;
after(()=>rm(root,{recursive:true,force:true}));
const env={QUICKPAY_MODE:'test',QUICKPAY_API_KEY:'test',QUICKPAY_CAPTURE_ENABLED:'1',SMERCH_FINANCE_ENABLED:'0'};
const staff={type:'staff',name:'Test reviewer'},response=value=>({ok:true,status:200,json:async()=>structuredClone(value)});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function fixture(count=1){
 const checkout={id:'pay-'+randomUUID(),status:'authorized',paymentProvider:'quickpay',paymentMode:'test',totalIncVat:10000,quickpayPaymentId:123,quickpayOrderId:randomUUID(),authorizationExpiresAt:new Date(Date.now()+3600000).toISOString(),legal:{prepayment:true,prepaymentText:'Accepted prepayment',acceptedAt:new Date().toISOString()},lines:[{sku:'test-sku',quantity:1,decorations:[{}]}],pfOrderIds:[],fulfillment:{groups:[]},events:[]},orders=[];
 await mkdir(join(root,'orders'),{recursive:true});
 for(let index=0;index<count;index++){
  const id='ord-'+randomUUID(),proof={version:1,hash:'proof-'+index},order={id,checkoutId:checkout.id,createdAt:new Date().toISOString(),purchaseOrderNumber:'SMERCH-'+id.slice(4),pfOrderNumber:123,status:'approval_pending_pf',proof,proofs:[proof],decision:{decision:'approve',actor:'customer',version:1,proofHash:proof.hash,staffApproval:{version:1,proofHash:proof.hash,performedBy:staff}},events:[]};
  orders.push(order);checkout.pfOrderIds.push(id);checkout.fulfillment.groups.push({});await writeFile(join(root,'orders',id+'.json'),JSON.stringify(order));
 }
 await persistCheckout(checkout);
 const payment={id:123,order_id:checkout.quickpayOrderId,type:'Payment',currency:'DKK',test_mode:true,accepted:true,link:{amount:10000},operations:[{id:1,type:'authorize',amount:10000,pending:false,qp_status_code:'20000',created_at:new Date().toISOString()}]};
 return {checkout,orders,payment};
}
const newProof=id=>recordProof(id,{proofReference:'proof-v2',proofUrl:'https://example.invalid/proof-v2.pdf'});
function captured(payment){return {...payment,operations:[...payment.operations,{id:2,type:'capture',amount:10000,pending:false,qp_status_code:'20000'}]};}

test('new proof received during Quickpay GET blocks legacy capture before intent or POST',async()=>{
 for(const groups of [1,2]){
  const f=await fixture(groups);let posts=0;
  await assert.rejects(captureApprovedCheckout(f.checkout.id,{env,fetchImpl:async(url,options)=>{
   if(options.method==='GET'){await newProof(f.orders.at(-1).id);assert.equal(await checkoutReadyForCapture(f.checkout),false);return response(f.payment);}
   posts++;return response(captured(f.payment));
  }}),/ikke godkendt/);
  const checkout=await readCheckout(f.checkout.id);
  assert.equal(posts,0);assert.equal(checkout.status,'authorized');assert.equal(checkout.events.some(event=>event.type==='quickpay_capture_requested'),false);
  assert.equal((await readOrder(f.orders.at(-1).id)).proof.version,2);
 }
});

test('capture holds the aggregate through provider POST, blocking proof replacement on every PF group',{timeout:5000},async()=>{
 const f=await fixture(2),posting=deferred(),finish=deferred();let replacement;
 const task=captureApprovedCheckout(f.checkout.id,{env,fetchImpl:async(url,options)=>{
  if(options.method==='GET')return response(f.payment);
  posting.resolve();await finish.promise;
  assert.equal((await readOrder(f.orders[1].id)).proof.version,1);
  return response(captured(f.payment));
 }});
 try{
  await posting.promise;
  assert.equal((await readCheckout(f.checkout.id)).status,'capture_reconciliation');
  replacement=newProof(f.orders[1].id);
  assert.equal(await Promise.race([replacement.then(()=> 'replaced'),delay(30,'blocked')]),'blocked');
 }finally{finish.resolve();}
 await task;await replacement;
 assert.equal((await readCheckout(f.checkout.id)).status,'paid');
 assert.equal((await readOrder(f.orders[1].id)).proof.version,2);
});

test('staff proof approval reenters the shared checkout lock without deadlocking',{timeout:3000},async()=>{
 const f=await fixture();let posts=0;
 const result=await approveProofPayment(f.orders[0].id,{version:1,confirmed:true,performedBy:staff},{env,fetchImpl:async(url,options)=>{
  if(options.method==='POST'){posts++;return response(captured(f.payment));}
  return response(f.payment);
 }});
 assert.equal(result.state,'paid');assert.equal(posts,1);
});

test('changed payment identity or amount during GET cannot capture the stale payment',async()=>{
 for(const patch of [{quickpayPaymentId:456},{quickpayOrderId:'replacement'},{totalIncVat:20000}]){
  const f=await fixture();let posts=0;
  await assert.rejects(captureApprovedCheckout(f.checkout.id,{env,fetchImpl:async(url,options)=>{
   if(options.method==='POST'){posts++;return response(captured(f.payment));}
   await updateCheckout(f.checkout.id,value=>Object.assign(value,patch));return response(f.payment);
  }}),/Betalingen er ændret/);
  assert.equal(posts,0);assert.equal((await readCheckout(f.checkout.id)).status,'authorized');
 }
});

test('capture timeout retains reconciliation and releases the proof lock; retry cannot POST again',async()=>{
 const f=await fixture();let posts=0;
 const fetchImpl=async(url,options)=>{if(options.method==='POST'){posts++;throw Error('Timed out');}return response(f.payment);};
 await assert.rejects(captureApprovedCheckout(f.checkout.id,{env,fetchImpl}),/afstemning/);
 assert.equal((await readCheckout(f.checkout.id)).status,'capture_reconciliation');
 await assert.rejects(captureApprovedCheckout(f.checkout.id,{env,fetchImpl}),/afstemmes/);
 await newProof(f.orders[0].id);
 assert.equal(posts,1);assert.equal((await readOrder(f.orders[0].id)).proof.version,2);
});

test('wrong payment capture response never records a confirmed paid checkout',async()=>{
 const f=await fixture();
 await assert.rejects(captureApprovedCheckout(f.checkout.id,{env,fetchImpl:async(url,options)=>response(options.method==='POST'?{...captured(f.payment),id:456}:f.payment)}),/afstemmes/);
 assert.equal((await readCheckout(f.checkout.id)).status,'capture_reconciliation');
});

const financeEnv={...env,SMERCH_FINANCE_ENABLED:'1',SMERCH_PAYMENT_AGREEMENT_CONFIRMED:'1'};
async function financeFixture(count=1){
 const f=await fixture(count);f.checkout.legal.customerType='consumer';Object.assign(f.checkout,{shipping:{country:'DK'},quote:{net:8000,lines:[{net:8000}]},freightExVat:0});await persistCheckout(f.checkout);return f;
}
test('finance capture keeps current proof fixed across GET, persisted intent, POST and confirmation',{timeout:5000},async()=>{
 const f=await financeFixture(2),reading=deferred(),continueGET=deferred();let replacement,posts=0,posted=false;
 const key='finance-proof-race:'+f.checkout.id;
 const task=executeSalesPayment(f.checkout.id,{kind:'capture',amount:10000,key},{env:financeEnv,fetchImpl:async(url,options)=>{
  if(options.method==='GET'&&!posted){reading.resolve();await continueGET.promise;return response(f.payment);}
  if(options.method==='POST'){
   posts++;posted=true;
   assert.equal((await readLedger()).orders[f.checkout.id].operations[0].status,'requested');
   assert.equal((await readOrder(f.orders[1].id)).proof.version,1);
  }
  return response(captured(f.payment));
 }});
 try{
  await reading.promise;replacement=newProof(f.orders[1].id);
  assert.equal(await Promise.race([replacement.then(()=> 'replaced'),delay(30,'blocked')]),'blocked');
 }finally{continueGET.resolve();}
 const result=await task;await replacement;
 assert.equal(result.status,'confirmed');assert.equal(posts,1);assert.equal((await readCheckout(f.checkout.id)).status,'paid');assert.equal((await readOrder(f.orders[1].id)).proof.version,2);
});

test('finance capture rejects a newer unapproved proof before writing an operation',async()=>{
 const f=await financeFixture();await newProof(f.orders[0].id);let posts=0;
 await assert.rejects(executeSalesPayment(f.checkout.id,{kind:'capture',amount:10000,key:'finance-proof-first:'+f.checkout.id},{env:financeEnv,fetchImpl:async(url,options)=>{if(options.method==='POST')posts++;return response(f.payment);}}),/aktuelle korrekturer/);
 assert.equal(posts,0);assert.equal((await readLedger()).orders[f.checkout.id].operations.length,0);assert.equal((await readCheckout(f.checkout.id)).status,'authorized');
});

test('finance-enabled staff approval reenters aggregate before ledger without deadlock',{timeout:3000},async()=>{
 const f=await financeFixture();let posts=0;
 const result=await approveProofPayment(f.orders[0].id,{version:1,confirmed:true,performedBy:staff},{env:financeEnv,fetchImpl:async(url,options)=>{
  if(options.method==='POST')posts++;
  return response(posts?captured(f.payment):f.payment);
 }});
 assert.equal(result.state,'paid');assert.equal(posts,1);assert.equal((await readLedger()).orders[f.checkout.id].operations[0].status,'confirmed');
});

const stripeEnv={STRIPE_CAPTURE_ENABLED:'1',STRIPE_SECRET_KEY:'sk_test_mock',SMERCH_FINANCE_ENABLED:'0'};
async function stripeFixture(count=1){
 const f=await fixture(count);Object.assign(f.checkout,{paymentProvider:'stripe',stripePaymentIntentId:'pi_test_capture'});await persistCheckout(f.checkout);
 f.intent={id:'pi_test_capture',status:'requires_capture',currency:'dkk',amount:10000,amount_capturable:10000,latest_charge:{payment_method_details:{card:{capture_before:Math.floor((Date.now()+3600000)/1000)}}}};
 return f;
}
test('Stripe holds the shared proof aggregate through GET, capture intent and POST',{timeout:5000},async()=>{
 const f=await stripeFixture(2),reading=deferred(),continueGET=deferred();let replacement,posts=0;
 const task=captureApprovedCheckout(f.checkout.id,{env:stripeEnv,fetchImpl:async(url,options)=>{
  if(options.method!=='POST'){reading.resolve();await continueGET.promise;return response(f.intent);}
  posts++;assert.equal((await readOrder(f.orders[1].id)).proof.version,1);assert.equal((await readCheckout(f.checkout.id)).status,'capture_reconciliation');
  return response({id:f.intent.id,status:'succeeded',amount_received:10000});
 }});
 try{
  await reading.promise;replacement=newProof(f.orders[1].id);
  assert.equal(await Promise.race([replacement.then(()=> 'replaced'),delay(30,'blocked')]),'blocked');
 }finally{continueGET.resolve();}
 await task;await replacement;assert.equal(posts,1);assert.equal((await readCheckout(f.checkout.id)).status,'paid');assert.equal((await readOrder(f.orders[1].id)).proof.version,2);
});

test('Stripe refuses capture when proof replacement wins first',async()=>{
 const f=await stripeFixture();await newProof(f.orders[0].id);let posts=0;
 await assert.rejects(captureApprovedCheckout(f.checkout.id,{env:stripeEnv,fetchImpl:async(url,options)=>{if(options.method==='POST')posts++;return response(f.intent);}}),/ikke godkendt/);
 assert.equal(posts,0);assert.equal((await readCheckout(f.checkout.id)).status,'authorized');
});

test('Stripe staff approval reenters aggregate before checkout lock without deadlock',{timeout:3000},async()=>{
 const f=await stripeFixture();let posts=0;
 const result=await approveProofPayment(f.orders[0].id,{version:1,confirmed:true,performedBy:staff},{env:stripeEnv,fetchImpl:async(url,options)=>{
  if(options.method==='POST'){posts++;return response({id:f.intent.id,status:'succeeded',amount_received:10000});}return response(f.intent);
 }});
 assert.equal(result.state,'paid');assert.equal(posts,1);
});
