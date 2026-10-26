import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {rm} from 'node:fs/promises';
import {persistCheckout,readCheckout} from '../lib/checkout.mjs';
import {applyQuickpayCallback,captureQuickpay,createQuickpayLink,quickpayPaymentState,verifyQuickpayCallback} from '../lib/quickpay.mjs';
import {handoffAuthorizedCheckout} from '../lib/order-flow.mjs';

const env={PAYMENT_PROVIDER:'quickpay',QUICKPAY_API_KEY:'test-key',QUICKPAY_PRIVATE_KEY:'private-key',QUICKPAY_AUTH_HOLD_HOURS:'48',SMERCH_PUBLIC_BASE_URL:'http://localhost:5173',SMERCH_FREIGHT_EX_VAT_DKK:'40'};
const response=data=>({ok:true,json:async()=>data});
const paymentFixture=(order,testMode=true)=>({id:order.quickpayPaymentId,order_id:order.quickpayOrderId,type:'Payment',currency:'DKK',test_mode:testMode,accepted:true,link:{amount:order.totalIncVat},operations:[{id:1,type:'authorize',amount:order.totalIncVat,pending:false,qp_status_code:'20000',created_at:new Date().toISOString()}]});
const checkoutFixture=()=>({id:`pay-${randomUUID()}`,paymentProvider:'quickpay',status:'awaiting_payment',createdAt:new Date().toISOString(),totalIncVat:10000,quickpayPaymentId:12345,quickpayOrderId:randomUUID().slice(0,20),authorizationExpiresAt:new Date(Date.now()+3600000).toISOString(),pfOrderIds:[],events:[]});

test('live callbacks reject test or unspecified payment mode without authorizing an order',async()=>{
 const order=checkoutFixture();await persistCheckout(order);
 try{
  for(const testMode of [true,undefined]){
   const payment=paymentFixture(order);payment.test_mode=testMode;
   await assert.rejects(applyQuickpayCallback(payment,{env:{...env,QUICKPAY_MODE:'live'}}),/test\/live/);
   assert.equal((await readCheckout(order.id)).status,'awaiting_payment');
  }
  await applyQuickpayCallback(paymentFixture(order,false),{env:{...env,QUICKPAY_MODE:'live'}});
  assert.equal((await readCheckout(order.id)).paymentMode,'live');
 }finally{await rm(new URL(`../.private/checkouts/${order.id}.json`,import.meta.url),{force:true});}
});

test('test payments cannot enter live PF production after a configuration switch',async()=>{
 const order=checkoutFixture();await persistCheckout(order);
 try{
  await assert.rejects(applyQuickpayCallback(paymentFixture(order,false),{env}),/test\/live/);
  await applyQuickpayCallback(paymentFixture(order),{env});
  assert.equal((await readCheckout(order.id)).paymentMode,'test');
  await assert.rejects(handoffAuthorizedCheckout(order.id,{env:{PF_GATEWAY_MODE:'live'}}),/testbetaling/);
  let posts=0;
  await assert.rejects(captureQuickpay(order.id,{env:{...env,QUICKPAY_MODE:'live'},fetchImpl:async(url,options)=>{if(options.method==='POST')posts++;return response(paymentFixture(order));}}),/test\/live/);
  assert.equal(posts,0);
 }finally{await rm(new URL(`../.private/checkouts/${order.id}.json`,import.meta.url),{force:true});}
});

test('concurrent capture requests send at most one capture to Quickpay',async()=>{
 const order={...checkoutFixture(),status:'authorized'};await persistCheckout(order);
 let gets=0,posts=0,release;const bothRead=new Promise(resolve=>{release=resolve;});
 const fetchImpl=async(url,options)=>{
  const payment=paymentFixture(order);
  if(options.method==='GET'){if(++gets===2)release();await bothRead;return response(payment);}
  posts++;payment.operations.push({id:2,type:'capture',amount:10000,pending:false,qp_status_code:'20000'});return response(payment);
 };
 try{
  const results=await Promise.allSettled([captureQuickpay(order.id,{env,fetchImpl}),captureQuickpay(order.id,{env,fetchImpl})]);
  assert.equal(posts,1);assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal((await readCheckout(order.id)).status,'paid');
 }finally{await rm(new URL(`../.private/checkouts/${order.id}.json`,import.meta.url),{force:true});}
});
test('Quickpay link reserves without auto capture and signed callback controls order state',async()=>{const id=`pay-${randomUUID()}`,order={id,paymentProvider:'quickpay',status:'prepared',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),totalIncVat:10000,paymentAttempt:0,shipping:{email:'test@example.dk'},pfOrderIds:[],events:[]};await persistCheckout(order);let paymentId,linkBody,captureCalls=0;const authorized=()=>({id:12345,order_id:paymentId,currency:'DKK',type:'Payment',link:{amount:10000},accepted:true,operations:[{id:1,type:'authorize',amount:10000,pending:false,qp_status_code:'20000',created_at:new Date().toISOString()}]});try{const session=await createQuickpayLink(id,{env,fetchImpl:async(url,options)=>{if(options.method==='POST'&&url.endsWith('/payments')){paymentId=JSON.parse(options.body).order_id;return response({id:12345,order_id:paymentId});}if(options.method==='PUT'){linkBody=JSON.parse(options.body);return response({url:'https://payment.quickpay.net/payments/test-link'});}throw Error(url);}});assert.equal(session.paymentId,12345);assert.equal(linkBody.amount,10000);assert.equal(linkBody.auto_capture,false);assert.equal(linkBody.callback_url,'http://localhost:5173/api/quickpay/callback');assert.equal((await readCheckout(id)).status,'awaiting_payment');const raw=Buffer.from(JSON.stringify(authorized())),sig=createHmac('sha256',env.QUICKPAY_PRIVATE_KEY).update(raw).digest('hex');assert.equal(verifyQuickpayCallback(raw,sig,env.QUICKPAY_PRIVATE_KEY),true);assert.equal(verifyQuickpayCallback(Buffer.from('wrong'),sig,env.QUICKPAY_PRIVATE_KEY),false);assert.equal(quickpayPaymentState({...authorized(),link:{amount:1}},10000),'invalid');await applyQuickpayCallback(authorized(),{env});await applyQuickpayCallback(authorized(),{env});assert.equal((await readCheckout(id)).status,'authorized');const fetchImpl=async(url,options)=>{if(options.method==='POST'){captureCalls++;const payment=authorized();payment.operations.push({id:2,type:'capture',amount:10000,pending:false,qp_status_code:'20000'});return response(payment);}return response(authorized());};await assert.rejects(captureQuickpay(id,{env,fetchImpl,canCapture:async()=>false}),/ikke godkendt/);assert.equal(captureCalls,0);await captureQuickpay(id,{env,fetchImpl,canCapture:async()=>true});assert.equal(captureCalls,1);assert.equal((await readCheckout(id)).status,'paid');}finally{await rm(new URL(`../.private/checkouts/${id}.json`,import.meta.url),{force:true});}});

test('Quickpay capture never posts after the conservative authorization window',async()=>{const id=`pay-${randomUUID()}`,orderId='SM123456789012340000',order={id,paymentProvider:'quickpay',status:'authorized',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),authorizedAt:new Date(Date.now()-7200000).toISOString(),authorizationExpiresAt:new Date(Date.now()-3600000).toISOString(),totalIncVat:10000,quickpayPaymentId:12345,quickpayOrderId:orderId,pfOrderIds:[],events:[]};await persistCheckout(order);let posts=0;try{await assert.rejects(captureQuickpay(id,{env,canCapture:async()=>true,fetchImpl:async(url,options)=>{if(options.method==='POST')posts++;return response({id:12345,order_id:orderId,currency:'DKK',type:'Payment',link:{amount:10000},accepted:true,operations:[{id:1,type:'authorize',amount:10000,pending:false,qp_status_code:'20000'}]});}}),/udløbet/);assert.equal(posts,0);assert.equal((await readCheckout(id)).status,'authorization_expired');}finally{await rm(new URL(`../.private/checkouts/${id}.json`,import.meta.url),{force:true});}});

test('Quickpay sends the customer back to the shop while callbacks stay on the API origin',async()=>{
 const id=`pay-${randomUUID()}`,order={id,createdAt:new Date().toISOString(),paymentProvider:'quickpay',status:'prepared',totalIncVat:10000,paymentAttempt:0,shipping:{email:'test@example.invalid'},events:[]};
 await persistCheckout(order);let link;
 try{
  await createQuickpayLink(id,{env:{...env,SMERCH_PUBLIC_BASE_URL:'https://api.smerch.dk',SMERCH_CUSTOMER_BASE_URL:'https://smerch.dk'},fetchImpl:async(url,options)=>{
   const body=JSON.parse(options.body);if(options.method==='POST')return response({id:12345,order_id:body.order_id});link=body;return response({url:'https://payment.quickpay.net/payments/test-return'});
  }});
  assert.equal(link.continue_url,`https://smerch.dk/ordre?checkout=${id}`);assert.equal(link.cancel_url,'https://smerch.dk/betaling?annulleret=1');assert.equal(link.callback_url,'https://api.smerch.dk/api/quickpay/callback');assert.equal(link.auto_capture,false);assert.equal(link.payment_methods,'mobilepay,apple-pay,google-pay,creditcard');assert.equal(link.auto_fee,false);
 }finally{await rm(new URL(`../.private/checkouts/${id}.json`,import.meta.url),{force:true});}
});

test('manual status check reads Quickpay, records method and successful check time without sending a payment operation',async()=>{
 const {refreshQuickpayStatus,paymentStatusSummary}=await import('../lib/quickpay.mjs');
 const order=checkoutFixture();await persistCheckout(order);const calls=[];
 try{
  const payment={...paymentFixture(order),metadata:{type:'card',origin:'mobilepay',brand:'visa',last4:'1234',customer_ip:'private'}};
  const updated=await refreshQuickpayStatus(order.id,{env,fetchImpl:async(url,options)=>{calls.push([url,options.method]);return response(payment);}});
  assert.equal(updated.status,'authorized');assert.equal(updated.paymentMethod,'MobilePay');
  assert.ok(Number.isFinite(Date.parse(updated.paymentCheckedAt)));
  assert.ok(updated.paymentStatusReceivedAt);assert.deepEqual(updated.pfOrderIds,[]);
  assert.equal(calls.length,1);assert.equal(calls[0][1],'GET');
  assert.equal(JSON.stringify(paymentStatusSummary(updated)).includes('1234'),false);
  const checkedAt=updated.paymentCheckedAt;
  await assert.rejects(refreshQuickpayStatus(order.id,{env,fetchImpl:async()=>response({...payment,link:{amount:1}})}),/matcher ikke/);
  assert.equal((await readCheckout(order.id)).paymentCheckedAt,checkedAt,'failed checks retain the last successful check');
 }finally{await rm(new URL(`../.private/checkouts/${order.id}.json`,import.meta.url),{force:true});}
});
test('only supplier-confirmed wallet metadata identifies a wallet; cards and unknown methods stay distinct',async()=>{
 const {quickpayMethod}=await import('../lib/quickpay.mjs');
 assert.equal(quickpayMethod({metadata:{type:'card',brand:'visa'}}),'Visa');
 assert.equal(quickpayMethod({metadata:{origin:'apple-pay',brand:'visa'}}),'Apple Pay');
 assert.equal(quickpayMethod({metadata:{type:'card'}}),'Betalingskort');
 assert.equal(quickpayMethod({link:{payment_methods:'mobilepay,creditcard'}}),null);
});

test('historical status lookup uses the recorded live mode after the shop returns to test mode',async()=>{
 const {refreshQuickpayStatus}=await import('../lib/quickpay.mjs');
 for(const storedMode of ['live',null]){
  const order={...checkoutFixture(),status:'authorized',adminPilot:true,paymentMode:storedMode};await persistCheckout(order);
  try{
   const payment={...paymentFixture(order,false),metadata:{origin:'mobilepay',type:'card',brand:'visa'}};
   const result=await refreshQuickpayStatus(order.id,{env:{...env,QUICKPAY_MODE:'test'},fetchImpl:async(url,options)=>{assert.equal(options.method,'GET');return response(payment);}});
   assert.equal(result.paymentMethod,'MobilePay');assert.equal(result.status,'authorized');assert.ok(result.paymentCheckedAt);assert.deepEqual(result.pfOrderIds,[]);
   await assert.rejects(refreshQuickpayStatus(order.id,{env:{...env,QUICKPAY_MODE:'test'},fetchImpl:async()=>response({...payment,test_mode:true})}),/test\/live/);
  }finally{await rm(new URL(`../.private/checkouts/${order.id}.json`,import.meta.url),{force:true});}
 }
});
test('historical test status lookup stays in test mode after the shop switches to live',async()=>{
 const {refreshQuickpayStatus}=await import('../lib/quickpay.mjs');
 const order={...checkoutFixture(),paymentMode:'test'};await persistCheckout(order);
 try{
  const result=await refreshQuickpayStatus(order.id,{env:{...env,QUICKPAY_MODE:'live'},fetchImpl:async()=>response(paymentFixture(order,true))});
  assert.equal(result.paymentMode,'test');assert.equal(result.status,'authorized');
 }finally{await rm(new URL(`../.private/checkouts/${order.id}.json`,import.meta.url),{force:true});}
});
