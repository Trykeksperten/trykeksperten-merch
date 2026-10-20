import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,scryptSync} from 'node:crypto';
import {rm} from 'node:fs/promises';
import {adminCheckoutTestReady,assertAdminCheckoutTest} from '../lib/admin-checkout-test.mjs';
import {adminSessionAuthorized,createAdminSession,closeAdminSession} from '../lib/admin-auth.mjs';
import {persistCheckout,readCheckout} from '../lib/checkout.mjs';
import {createQuickpayLink,applyQuickpayCallback,captureQuickpay} from '../lib/quickpay.mjs';
import {handoffAuthorizedCheckout,captureApprovedCheckout} from '../lib/order-flow.mjs';
const env={PAYMENT_PROVIDER:'quickpay',QUICKPAY_MODE:'test',QUICKPAY_LIVE_ENABLED:'0',QUICKPAY_CAPTURE_ENABLED:'0',PF_GATEWAY_MODE:'test',PF_AUTO_SUBMIT_ENABLED:'0',QUICKPAY_API_KEY:'fixture',QUICKPAY_PRIVATE_KEY:'fixture',SMERCH_PUBLIC_BASE_URL:'https://shop.example',SMERCH_FREIGHT_EX_VAT_DKK:'150'};
test('admin checkout requires authenticated same-origin request and every test safeguard',()=>{
 const request={socket:{remoteAddress:'test-checkout'},method:'POST',headers:{host:'shop.example',origin:'https://shop.example','x-smerch-admin':'1'}};
 assert.throws(()=>assertAdminCheckoutTest(adminSessionAuthorized(request),env),/Administrator/);
 const salt=randomBytes(16).toString('hex'),password='fixture-password',headers={},res={setHeader:(k,v)=>headers[k]=v};
 createAdminSession(request,res,{username:'fixture',password},{SMERCH_ADMIN_USERNAME:'fixture',SMERCH_ADMIN_PASSWORD_HASH:`${salt}:${scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex')}`});
 request.headers.cookie=headers['Set-Cookie'].split(';')[0];
 assert.doesNotThrow(()=>assertAdminCheckoutTest(adminSessionAuthorized(request),env));
 assert.throws(()=>assertAdminCheckoutTest(adminSessionAuthorized({...request,headers:{...request.headers,origin:'https://other.example'}}),env));
 assert.throws(()=>assertAdminCheckoutTest(adminSessionAuthorized({...request,headers:{...request.headers,'x-smerch-admin':undefined}}),env));
 for(const key of ['PAYMENT_PROVIDER','QUICKPAY_MODE','QUICKPAY_LIVE_ENABLED','QUICKPAY_CAPTURE_ENABLED','PF_GATEWAY_MODE','PF_AUTO_SUBMIT_ENABLED'])for(const value of [undefined,'live','1'])assert.equal(adminCheckoutTestReady({...env,[key]:value}),false,key);
 closeAdminSession(request,res);
});
test('admin test uses real payment link flow but permanently blocks capture and PF and rejects real-card callbacks',async()=>{
 const order={id:`pay-${randomUUID()}`,adminTest:true,paymentProvider:'quickpay',status:'prepared',createdAt:new Date().toISOString(),totalIncVat:100,paymentAttempt:0,shipping:{email:'fixture@example.invalid'},pfOrderIds:[],events:[]};
 await persistCheckout(order);let body;
 try{
  await createQuickpayLink(order.id,{env,fetchImpl:async(url,options)=>{const data=JSON.parse(options.body);if(options.method==='POST')return {ok:true,json:async()=>({id:12345,order_id:data.order_id})};body=data;return {ok:true,json:async()=>({url:'https://payment.quickpay.net/payments/fixture'})};}});
  assert.equal(body.auto_capture,false);assert.equal(body.payment_methods,'creditcard');assert.match(body.cancel_url,/test=1/);assert.equal(body.callback_url,'https://shop.example/api/quickpay/callback');
  const stored=await readCheckout(order.id),payment={id:12345,order_id:stored.quickpayOrderId,type:'Payment',currency:'DKK',accepted:true,test_mode:false,link:{amount:100},operations:[{id:1,type:'authorize',amount:100,pending:false,qp_status_code:'20000',created_at:new Date().toISOString()}]};
  await assert.rejects(applyQuickpayCallback(payment,{env}),/testkort/);
  assert.equal((await readCheckout(order.id)).status,'awaiting_payment');
  await applyQuickpayCallback({...payment,test_mode:true},{env});assert.equal((await readCheckout(order.id)).status,'authorized');
  for(const mode of ['test','live']){
   await assert.rejects(handoffAuthorizedCheckout(order.id,{env:{PF_GATEWAY_MODE:mode,PF_AUTO_SUBMIT_ENABLED:'1'}}),/må ikke sendes/);
   await assert.rejects(captureApprovedCheckout(order.id,{env:{QUICKPAY_CAPTURE_ENABLED:'1'}}),/må ikke hæves/);
   await assert.rejects(captureQuickpay(order.id,{env:{...env,QUICKPAY_MODE:mode,QUICKPAY_CAPTURE_ENABLED:'1'}}),/må ikke hæves/);
  }
 }finally{await rm(new URL(`../.private/checkouts/${order.id}.json`,import.meta.url),{force:true});}
});
