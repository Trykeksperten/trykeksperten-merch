import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assertAdminLiveTest,prepareAdminLiveTest} from '../lib/admin-checkout-test.mjs';
import {persistCheckout,readCheckout} from '../lib/checkout.mjs';
import {createQuickpayLink,applyQuickpayCallback,captureQuickpay,cancelQuickpay} from '../lib/quickpay.mjs';
import {handoffAuthorizedCheckout,captureApprovedCheckout} from '../lib/order-flow.mjs';
import {syncEconomicInvoice} from '../lib/economic-invoices.mjs';
import {queueOrderConfirmation} from '../lib/order-mail.mjs';
const root=await mkdtemp(join(tmpdir(),'smerch-live-test-'));process.env.SMERCH_DATA_DIR=root;
after(()=>rm(root,{recursive:true,force:true}));
const env={PAYMENT_PROVIDER:'quickpay',QUICKPAY_MODE:'test',QUICKPAY_LIVE_ENABLED:'0',QUICKPAY_CAPTURE_ENABLED:'0',PF_GATEWAY_MODE:'test',PF_AUTO_SUBMIT_ENABLED:'0',QUICKPAY_API_KEY:'fixture',QUICKPAY_PRIVATE_KEY:'fixture',SMERCH_PUBLIC_BASE_URL:'https://api.example',SMERCH_CUSTOMER_BASE_URL:'https://shop.example',SMERCH_FREIGHT_EX_VAT_DKK:'150'};
test('live test requires authenticated administrator, test isolation and HTTPS',()=>{
 assert.doesNotThrow(()=>assertAdminLiveTest(true,env));
 assert.throws(()=>assertAdminLiveTest(false,env));
 for(const key of ['QUICKPAY_CAPTURE_ENABLED','PF_AUTO_SUBMIT_ENABLED','QUICKPAY_LIVE_ENABLED'])assert.throws(()=>assertAdminLiveTest(true,{...env,[key]:'1'}));
 assert.throws(()=>assertAdminLiveTest(true,{...env,SMERCH_CUSTOMER_BASE_URL:'http://shop.example'}));
});
test('5 kr live reservation verifies callbacks, blocks all commerce, cancels after environment changes',async()=>{
 const quote={totalIncVat:10000,net:8000};const order=prepareAdminLiveTest({id:'pay-'+randomUUID(),status:'prepared',paymentProvider:'quickpay',totalIncVat:28750,quote,lines:[],pfOrderIds:[],createdAt:new Date().toISOString(),shipping:{email:'fixture@example.invalid'},events:[]});
 assert.equal(order.totalIncVat,500);assert.equal(order.testOriginalTotalIncVat,28750);assert.deepEqual(order.quote,quote);
 await persistCheckout(order);let link;
 await createQuickpayLink(order.id,{env,fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);if(options.method==='POST')return {ok:true,json:async()=>({id:987654,order_id:body.order_id})};link=body;return {ok:true,json:async()=>({url:'https://payment.quickpay.net/payments/fixture'})};}});
 assert.equal(link.amount,500);assert.equal(link.auto_capture,false);assert.equal(link.payment_methods,'mobilepay');assert.equal(link.callback_url,'https://api.example/api/quickpay/callback');assert.match(link.continue_url,/https:\/\/shop.example\/ordre\?checkout=/);
 const saved=await readCheckout(order.id),payment={id:saved.quickpayPaymentId,order_id:saved.quickpayOrderId,type:'Payment',currency:'DKK',test_mode:false,accepted:true,link:{amount:500},operations:[{id:1,type:'authorize',amount:500,pending:false,qp_status_code:'20000'}]};
 await assert.rejects(applyQuickpayCallback({...payment,test_mode:true},{env}),/test\/live/);
 await assert.rejects(applyQuickpayCallback({...payment,link:{amount:100}},{env}),/beløb/);
 await applyQuickpayCallback(payment,{env});await applyQuickpayCallback(payment,{env});
 const authorized=await readCheckout(order.id);assert.equal(authorized.status,'authorized');assert.equal(authorized.paymentMode,'live');assert.equal(authorized.events.filter(e=>e.id).length,1);
 for(const mode of ['test','live']){
  await assert.rejects(handoffAuthorizedCheckout(order.id,{env:{PF_GATEWAY_MODE:mode,PF_AUTO_SUBMIT_ENABLED:'1'}}),/må ikke sendes/);
  await assert.rejects(captureApprovedCheckout(order.id,{env:{QUICKPAY_CAPTURE_ENABLED:'1'}}),/må ikke hæves/);
  await assert.rejects(captureQuickpay(order.id,{env:{...env,QUICKPAY_MODE:mode,QUICKPAY_CAPTURE_ENABLED:'1'}}),/må ikke hæves/);
 }
 const economic={ECONOMIC_ENABLED:'1',ECONOMIC_APP_SECRET_TOKEN:'fixture',ECONOMIC_AGREEMENT_GRANT_TOKEN:'fixture',ECONOMIC_CUSTOMER_GROUP_NUMBER:'1',ECONOMIC_PAYMENT_TERMS_NUMBER:'2',ECONOMIC_LAYOUT_NUMBER:'3',ECONOMIC_VAT_ZONE_NUMBER:'1',ECONOMIC_PRODUCT_NUMBER:'MERCH',ECONOMIC_FREIGHT_PRODUCT_NUMBER:'FRAGT'};
 await assert.rejects(syncEconomicInvoice(order.id,{env:economic,fetchImpl:()=>{throw Error('Must never call accounting');}}),/Kun bekræftede liveordrer/);
 await queueOrderConfirmation({...authorized,legal:{documents:{}}});await assert.rejects(access(join(root,'order-mail',order.id+'.json')));
 await cancelQuickpay(order.id,{env:{...env,QUICKPAY_MODE:'live'},fetchImpl:async(url,options)=>({ok:true,json:async()=>options.method==='POST'?{...payment,operations:[...payment.operations,{id:2,type:'cancel',pending:false,qp_status_code:'20000'}]}:payment})});
 assert.equal((await readCheckout(order.id)).status,'cancelled');
 await applyQuickpayCallback(payment,{env});assert.equal((await readCheckout(order.id)).status,'cancelled');
});
