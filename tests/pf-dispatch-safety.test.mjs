import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {persistCheckout,readCheckout,updateCheckout} from '../lib/checkout.mjs';
import {dispatchOrder,readOrder,applyPFNotification,hasUnresolvedPFCancellation} from '../lib/pf-orders.mjs';
import {checkoutReadyForCapture} from '../lib/order-flow.mjs';
import {supplierPaymentReady} from '../lib/production-payment.mjs';
import {executeSalesPayment} from '../lib/sales-payments.mjs';
import {saveRecord} from '../lib/backoffice/records.mjs';
import {closeDatabases} from '../lib/backoffice/database.mjs';

const root=await mkdtemp('/tmp/smerch-pf-safety-'),previous=process.env.SMERCH_DATA_DIR,previousDatabase=process.env.SMERCH_DATABASE_ENABLED;
process.env.SMERCH_DATA_DIR=root;delete process.env.SMERCH_DATABASE_ENABLED;
after(async()=>{closeDatabases();if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;if(previousDatabase===undefined)delete process.env.SMERCH_DATABASE_ENABLED;else process.env.SMERCH_DATABASE_ENABLED=previousDatabase;await rm(root,{recursive:true,force:true});});
const env={PF_GATEWAY_MODE:'test',PF_GATEWAY_USERNAME:'audit',PF_GATEWAY_TEST_PASSWORD:'audit',PF_GATEWAY_SENDER_ID:'TEST',PF_COMMUNICATION_EMAIL:'audit@example.invalid'};
const liveEnv={...env,PF_GATEWAY_MODE:'live',PF_GATEWAY_LIVE_ENABLED:'1',PF_GATEWAY_PROD_PASSWORD:'audit',QUICKPAY_MODE:'live',QUICKPAY_API_KEY:'audit',QUICKPAY_CAPTURE_ENABLED:'1',SMERCH_FINANCE_ENABLED:'1',SMERCH_PAYMENT_AGREEMENT_CONFIRMED:'1'};
const response=data=>({ok:true,status:200,json:async()=>structuredClone(data)});
const checkout=changes=>({id:'pay-'+randomUUID(),createdAt:new Date().toISOString(),status:'authorized',paymentProvider:'quickpay',paymentMode:'live',totalIncVat:10000,authorizationExpiresAt:new Date(Date.now()+3600000).toISOString(),quickpayPaymentId:123,quickpayOrderId:randomUUID().slice(0,20),shipping:{name:'Test',email:'test@example.invalid',country:'DK'},legal:{customerType:'consumer'},quote:{net:8000,lines:[{net:8000}]},freightExVat:0,lines:[{sku:'TEST',quantity:1,decorations:[]}],pfOrderIds:[],events:[],...changes});
async function pf(changes={}){const id='ord-'+randomUUID(),order={id,createdAt:new Date().toISOString(),status:'prepared',purchaseOrderNumber:'SMERCH-'+id.slice(4),lines:[{sku:'TEST',quantity:1,decorations:[]}],gatewayPayload:{Header:{isTest:true,messageId:randomUUID()},OrderType:'BLANK'},events:[],...changes};if(process.env.SMERCH_DATABASE_ENABLED==='1')saveRecord('orders',id,order);else{await mkdir(root+'/orders',{recursive:true});await writeFile(root+'/orders/'+id+'.json',JSON.stringify(order));}return order;}
async function linked(changes={},live=false){const c=checkout(changes),o=await pf({checkoutId:c.id,checkoutGroupIndex:0});if(live){o.gatewayPayload.Header.isTest=false;await writeFile(root+'/orders/'+o.id+'.json',JSON.stringify(o));}c.pfOrderIds=[o.id];c.fulfillment={groups:[{lineIndexes:[0]}]};await persistCheckout(c);return {c,o};}
const payment=c=>({id:c.quickpayPaymentId,order_id:c.quickpayOrderId,type:'Payment',currency:'DKK',test_mode:false,accepted:true,link:{amount:c.totalIncVat},operations:[{id:1,type:'authorize',amount:c.totalIncVat,pending:false,qp_status_code:'20000',created_at:new Date().toISOString()}]});
const notice=(o,messageId)=>({ShipmentNotification:{messageId,deliveries:[{deliveryLocation:{customerPONumber:o.purchaseOrderNumber,carrier:'TEST',shipDate:'2026-01-01',isOrderComplete:true,reference:{shipmentID:'TEST-SHIPMENT'},item:[{sku:'TEST',quantity:1}]}}]}});

for(const storage of ['json','sqlite'])test(`Gateway success preserves callbacks received during POST (${storage})`,async()=>{
 if(storage==='sqlite')process.env.SMERCH_DATABASE_ENABLED='1';
 try{const o=await pf();const result=await dispatchOrder(o.id,{env,fetchImpl:async()=>{
  await applyPFNotification('confirmation',{reference:o.purchaseOrderNumber,orderNumber:9999999,messageId:'confirmation'});
  await applyPFNotification('status',{StatusChangedNotification:{poNumber:o.purchaseOrderNumber,messageId:'cancelled',statusCode:'CANCELLED',expectedShipDate:'2026-10-29'}});
  return response({status:'success',yourMessageId:o.gatewayPayload.Header.messageId});
 }});
 assert.equal(result.status,'cancelled');assert.equal(result.pfOrderNumber,9999999);assert.equal(result.expectedShipDate,'2026-10-29');assert.equal(result.gatewayDispatch.status,'accepted');assert.ok(result.pfCancellation);assert.deepEqual(result.events.map(e=>e.type),['submitting','pf_confirmation','pf_status','gateway_accepted']);
 }finally{delete process.env.SMERCH_DATABASE_ENABLED;}
});

test('Gateway timeout preserves callback data and records uncertainty without retrying',async()=>{
 const o=await pf();let calls=0;
 await assert.rejects(dispatchOrder(o.id,{env,fetchImpl:async()=>{calls++;await applyPFNotification('confirmation',{reference:o.purchaseOrderNumber,orderNumber:9999999,messageId:'timeout-confirmation'});throw Error('simulated timeout');}}),/simulated timeout/);
 const stored=await readOrder(o.id);assert.equal(stored.status,'confirmed');assert.equal(stored.pfOrderNumber,9999999);assert.equal(stored.gatewayDispatch.status,'uncertain');assert.equal(stored.events.filter(e=>e.type==='pf_confirmation').length,1);
 await assert.rejects(dispatchOrder(o.id,{env,fetchImpl:async()=>{calls++;}}),/allerede behandlet/);assert.equal(calls,1);
});

test('concurrent dispatch attempts send one Gateway POST and normal success remains accepted',async()=>{
 const o=await pf();let calls=0;
 const results=await Promise.allSettled([1,2].map(()=>dispatchOrder(o.id,{env,fetchImpl:async()=>{calls++;return response({status:'success',yourMessageId:o.gatewayPayload.Header.messageId});}})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls,1);assert.equal((await readOrder(o.id)).status,'gateway_accepted');
});

test('cancelled supplier order stays conflicted across new ASN ids and later PROCESSING; capture never posts',async()=>{
 const {c,o}=await linked();await applyPFNotification('confirmation',{reference:o.purchaseOrderNumber,orderNumber:9999999,messageId:'confirmation'});
 await applyPFNotification('status',{StatusChangedNotification:{poNumber:o.purchaseOrderNumber,statusCode:'CANCELLED',messageId:'cancelled'}});
 for(const id of ['first-asn','same-delivery-new-id']){const received=await applyPFNotification('shipment',notice(o,id));assert.equal(received.status,'needs_attention');assert.equal(received.shipment.deliveries.length,1);assert.equal(await checkoutReadyForCapture(c),false);}
 await applyPFNotification('status',{StatusChangedNotification:{poNumber:o.purchaseOrderNumber,statusCode:'PROCESSING',messageId:'late-processing'}});
 const stored=await readOrder(o.id);assert.equal(stored.pfStatus,'PROCESSING');assert.equal(stored.status,'needs_attention');assert.equal(hasUnresolvedPFCancellation(stored),true);assert.equal(await checkoutReadyForCapture(c),false);
 let posts=0;await assert.rejects(executeSalesPayment(c.id,{kind:'capture',amount:10000,key:'test-cancel-conflict'},{env:liveEnv,fetchImpl:async(url,options)=>{if(options.method==='POST')posts++;return response(payment(c));}}),/afsendt/);assert.equal(posts,0);assert.equal((await readCheckout(c.id)).status,'authorized');
});

test('historical cancellation evidence blocks capture even if an older bug already set shipped',async()=>{
 const {c,o}=await linked();const stored={...o,status:'shipped',pfOrderNumber:9999999,shipment:{isOrderComplete:true,shipDate:'2026-01-01'},events:[{type:'pf_status',pfStatus:'CANCELLED'}]};await writeFile(root+'/orders/'+o.id+'.json',JSON.stringify(stored));assert.equal(await checkoutReadyForCapture(c),false);
});

test('missing, expired and nearly expired authorizations cannot reach Gateway',async()=>{
 for(const deadline of [undefined,'invalid','2026-01-01T00:00:00Z',new Date(Date.now()+30000).toISOString()]){
  const {c,o}=await linked({authorizationExpiresAt:deadline});let posts=0;await assert.rejects(dispatchOrder(o.id,{env,fetchImpl:async()=>{posts++;throw Error('must not post');}}),/betalingsreservation/);assert.equal(posts,0);assert.equal((await readOrder(o.id)).status,'prepared');if(!deadline||!Number.isFinite(Date.parse(deadline))||Date.parse(deadline)<Date.now())assert.equal(supplierPaymentReady(c),false);
 }
});

test('live PF dispatch verifies provider state and rejects cancelled or pending Quickpay operations',async()=>{
 for(const kind of ['cancelled','pending','wrong-mode']){const {c,o}=await linked({},true),p=payment(c);if(kind==='cancelled')p.operations.push({id:2,type:'cancel',amount:10000,pending:false,qp_status_code:'20000'});if(kind==='pending')p.operations.push({id:2,type:'capture',amount:10000,pending:true,qp_status_code:'20000'});if(kind==='wrong-mode')p.test_mode=true;let posts=0;
  await assert.rejects(dispatchOrder(o.id,{env:liveEnv,fetchImpl:async(url,options)=>{if(options.method==='POST')posts++;assert.match(url,/api\.quickpay\.net/);return response(p);}}));assert.equal(posts,0);assert.equal((await readOrder(o.id)).status,'prepared');
 }
 const {c,o}=await linked({},true),calls=[];await dispatchOrder(o.id,{env:liveEnv,fetchImpl:async(url,options)=>{calls.push(options.method||'GET');return response(url.includes('api.quickpay.net')?payment(c):{status:'success',yourMessageId:o.gatewayPayload.Header.messageId});}});assert.deepEqual(calls,['GET','POST']);
});

test('live supplier dispatch rereads checkout after provider GET and blocks changed payment identity, mode, status or expiry',async()=>{
 for(const change of [{quickpayPaymentId:456},{paymentMode:'test'},{status:'cancelled'},{authorizationExpiresAt:'2026-01-01'}]){
  const {c,o}=await linked({},true);let posts=0;
  await assert.rejects(dispatchOrder(o.id,{env:liveEnv,fetchImpl:async(url,options)=>{if(options.method==='POST')posts++;await updateCheckout(c.id,current=>Object.assign(current,change));return response(payment(c));}}),/ændret under kontrollen|betalingsreservation/);assert.equal(posts,0);
 }
});

test('live Stripe supplier dispatch checks exact active intent and provider expiry',async()=>{
 for(const change of [{status:'canceled'},{amount_capturable:1},{livemode:false},{latest_charge:{payment_method_details:{card:{capture_before:1}}}}]){const {c,o}=await linked({paymentProvider:'stripe',stripePaymentIntentId:'pi_test_supplier'},true);let posts=0;
  await assert.rejects(dispatchOrder(o.id,{env:liveEnv,fetchImpl:async(url,options)=>{if(options.method==='POST')posts++;return response({id:c.stripePaymentIntentId,livemode:true,currency:'dkk',status:'requires_capture',amount:10000,amount_capturable:10000,...change});}}),/Stripe/);assert.equal(posts,0);
 }
});
