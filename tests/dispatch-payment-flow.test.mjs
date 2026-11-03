import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {LEGAL_VERSION,validateCheckoutConsent,dispatchPaymentText} from '../dist/legal-consent.mjs';
import {dispatchPayment,proofPrepayment,proofReleaseReady} from '../dist/proof-payment-policy.mjs';
import {persistCheckout,readCheckout,updateCheckout,checkoutPublic} from '../lib/checkout.mjs';
import {approveProofPayment,sendEproofDecision,recordApprovalDelivery,readOrder} from '../lib/pf-orders.mjs';
import {checkoutReadyForCapture,captureApprovedCheckout} from '../lib/order-flow.mjs';
import {executeSalesPayment,reconcileSalesPayment} from '../lib/sales-payments.mjs';
import {processSalesFinance} from '../lib/sales-worker.mjs';
import {financeView} from '../lib/sales-ledger.mjs';
import {queueOrderConfirmation} from '../lib/order-mail.mjs';
import {paymentDescription} from '../dist/purchase-flow.mjs';
import {englishUI} from '../dist/english-ui.mjs';
let root;beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'smerch-dispatch-'));process.env.SMERCH_DATA_DIR=root;});afterEach(()=>rm(root,{recursive:true,force:true}));
const staff={type:'staff',name:'Synthetic reviewer'},approval={version:1,confirmed:true,performedBy:staff};
const env={PF_EPROOF_ENABLED:'1',PF_EPROOF_MODE:'test',PF_GATEWAY_SENDER_ID:'SMERCH',PF_GATEWAY_USERNAME:'synthetic',PF_GATEWAY_TEST_PASSWORD:'synthetic',QUICKPAY_MODE:'test',QUICKPAY_API_KEY:'synthetic',QUICKPAY_CAPTURE_ENABLED:'1',SMERCH_FINANCE_ENABLED:'1',SMERCH_PAYMENT_AGREEMENT_CONFIRMED:'1',SMERCH_FINANCE_START_AT:'2020-01-01T00:00:00Z',SMERCH_AUTOMATIC_SHIPMENT_CAPTURE:'1',SMERCH_PAYMENT_RECEIPT_MAIL:'review',SMERCH_ACCOUNTANT_MAIL:'review'};
const legal=(personalised=true,locale='da')=>validateCheckoutConsent({version:LEGAL_VERSION,locale,customerType:'consumer',accepted:true,personalised,prepayment:true},Date.now(),{personalised});
async function savePF(order){await mkdir(join(root,'orders'),{recursive:true});await writeFile(join(root,'orders',order.id+'.json'),JSON.stringify(order));}
async function fixture({printed=true,groups=1}={}){
 const checkout={id:'pay-'+randomUUID(),createdAt:new Date().toISOString(),status:'authorized',paymentProvider:'quickpay',paymentMode:'test',totalIncVat:10000,quickpayPaymentId:123,quickpayOrderId:randomUUID(),authorizationExpiresAt:new Date(Date.now()+3600000).toISOString(),legal:legal(printed),shipping:{country:'DK',name:'Synthetic',email:'test@example.invalid'},quote:{net:8000,lines:Array.from({length:groups},()=>({net:8000/groups}))},freightExVat:0,lines:Array.from({length:groups},(_,i)=>({sku:'sku-'+i,quantity:2,decorations:printed?[{text:'TEST'}]:[]})),pfOrderIds:[],fulfillment:{groups:[]},events:[]};
 const orders=[];for(let i=0;i<groups;i++){
  const proof={version:1,hash:'hash-'+i,api:{mode:'test',configurations:[{reference:'synthetic-'+i,url:'https://example.invalid/proof',SKUs:[{sku:'sku-'+i,lineReference:'line'}]}]}},order={id:'ord-'+randomUUID(),checkoutId:checkout.id,checkoutGroupIndex:i,productionLocation:'NL',purchaseOrderNumber:'SYNTHETIC',pfOrderNumber:123+i,lines:[checkout.lines[i]],proof:printed?proof:undefined,proofs:printed?[proof]:[],status:printed?'approval_pending_pf':'processing',gatewayPayload:{Header:{isTest:true}},decision:printed?{decision:'approve',actor:'customer',version:1,proofHash:proof.hash}:undefined,events:[]};
  checkout.pfOrderIds.push(order.id);checkout.fulfillment.groups.push({lineIndexes:[i],location:'NL'});orders.push(order);await savePF(order);
 }await persistCheckout(checkout);return {checkout,orders};
}
function provider(f,{timeout=false,pending=false,decline=false}={}){
 const calls=[],payment={id:123,order_id:f.checkout.quickpayOrderId,type:'Payment',currency:'DKK',test_mode:true,accepted:true,link:{amount:10000},operations:[{id:1,type:'authorize',amount:10000,pending:false,qp_status_code:'20000',created_at:new Date().toISOString()}]};
 const fetchImpl=async(url,options={})=>{
  if(url.startsWith('https://api.quickpay.net')){
   calls.push(options.method==='POST'?'capture':'get');
   if(options.method==='POST'){assert.match(url,/\/capture$/);assert.equal(JSON.parse(options.body).amount,10000);if(timeout)throw Error('Synthetic timeout');payment.operations.push({id:2,type:'capture',amount:10000,pending,qp_status_code:decline?'40000':'20000',created_at:new Date().toISOString()});}
   return new Response(JSON.stringify(payment));
  }calls.push('pf');return new Response('{}');
 };return {calls,payment,fetchImpl};
}
async function approve(f,g){for(const order of f.orders)if(order.proof)await approveProofPayment(order.id,approval,{env,fetchImpl:g.fetchImpl});}
async function ship(f,{partial=false,quantity=2,date=new Date(Date.now()-1000).toISOString(),index}={}){
 for(const [i,old] of f.orders.entries()){if(index!==undefined&&index!==i)continue;const order=await readOrder(old.id);order.status=partial?'partially_shipped':'shipped';const delivery={key:'parcel-'+i,shipDate:date,isOrderComplete:!partial,items:[{sku:order.lines[0].sku,quantity}]};const prior=order.shipment?.deliveries||[];if(prior.length&&!partial){delivery.key+='-final';delivery.items[0].quantity-=prior.reduce((n,d)=>n+d.items[0].quantity,0);}order.shipment={shipDate:date,isOrderComplete:!partial,deliveries:[...prior,delivery]};await savePF(order);}
}
test('new consent fixes dispatch timing in both languages despite obsolete prepayment request; bank stays separate',()=>{
 for(const locale of ['da','en'])for(const printed of [true,false]){const value=legal(printed,locale);assert.equal(value.prepayment,false);assert.equal(value.prepaymentText,'');assert.equal(value.captureTiming,'dispatch');assert.equal(value.paymentText,dispatchPaymentText[locale]);assert.ok(value.acceptedAt);assert.equal(proofPrepayment({legal:value}),false);}
 const input={version:LEGAL_VERSION,locale:'da',customerType:'consumer',accepted:true,personalised:true};assert.doesNotThrow(()=>validateCheckoutConsent(input));assert.throws(()=>validateCheckoutConsent({...input,version:'2026-10-27'}));const bank=validateCheckoutConsent(input,Date.now(),{bankTransfer:true});assert.equal(bank.captureTiming,'bank_prepayment');assert.equal(bank.prepayment,false);assert.equal(bank.paymentText,'');
});
test('proof approval and production release never capture new printed orders, including double click',async()=>{
 const f=await fixture(),g=provider(f);assert.equal(await checkoutReadyForCapture(f.checkout),false);assert.equal(proofReleaseReady(checkoutPublic(f.checkout),f.orders[0]),false);
 const results=await Promise.allSettled([1,2].map(()=>sendEproofDecision(f.orders[0].id,approval,{env,fetchImpl:g.fetchImpl})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(g.calls,['pf']);assert.equal((await readCheckout(f.checkout.id)).status,'authorized');assert.equal(proofReleaseReady(checkoutPublic(f.checkout),await readOrder(f.orders[0].id)),true);
 assert.equal(await checkoutReadyForCapture(f.checkout),false);await processSalesFinance({env,fetchImpl:g.fetchImpl});assert.deepEqual(g.calls,['pf']);
});
test('manual proof channel requires current staff approval but no payment capture',async()=>{
 const f=await fixture(),g=provider(f),id=f.orders[0].id;const input={channel:'PF Store',reference:'synthetic-reference',performedBy:staff};await assert.rejects(recordApprovalDelivery(id,input));assert.equal((await approveProofPayment(id,approval,{env,fetchImpl:g.fetchImpl})).state,'authorized');await recordApprovalDelivery(id,input);assert.deepEqual(g.calls,[]);assert.equal((await readCheckout(f.checkout.id)).status,'authorized');
});
test('stale proof, absent customer approval, missing staff confirmation and expired reservation cannot release production',async()=>{
 for(const change of ['stale','customer','staff','expired']){
  const f=await fixture(),g=provider(f),o=f.orders[0];if(change==='stale')o.decision.proofHash='old';if(change==='customer')o.decision.actor='staff';await savePF(o);if(change==='expired')await updateCheckout(f.checkout.id,v=>({...v,authorizationExpiresAt:'2020-01-01'}));
  await assert.rejects(sendEproofDecision(o.id,change==='staff'?{...approval,confirmed:false}:approval,{env,fetchImpl:g.fetchImpl}));assert.deepEqual(g.calls,[]);
 }
});
for(const printed of [false,true])test((printed?'printed':'blank')+' order is captured automatically exactly once only after full verified dispatch',async()=>{
 const f=await fixture({printed}),g=provider(f);await approve(f,g);await processSalesFinance({env,fetchImpl:g.fetchImpl});assert.deepEqual(g.calls,[]);
 await ship(f,{partial:true,quantity:1});await processSalesFinance({env,fetchImpl:g.fetchImpl});assert.equal(g.calls.includes('capture'),false);
 await ship(f);assert.equal(await checkoutReadyForCapture(f.checkout),true);await Promise.all([processSalesFinance({env,fetchImpl:g.fetchImpl}),processSalesFinance({env,fetchImpl:g.fetchImpl})]);await processSalesFinance({env,fetchImpl:g.fetchImpl});assert.equal(g.calls.filter(c=>c==='capture').length,1);assert.equal((await readCheckout(f.checkout.id)).status,'paid');const v=await financeView(f.checkout.id);assert.equal(v.summary.captured,10000);assert.equal(v.operations.length,1);assert.equal(v.operations[0].status,'confirmed');assert.ok(v.mail.every(m=>m.status==='review'));assert.equal(dispatchPayment(checkoutPublic(await readCheckout(f.checkout.id))),true);
});
test('all supplier groups and every printed proof must be complete before any capture',async()=>{
 const f=await fixture({groups:2}),g=provider(f);await approve(f,g);await ship(f,{index:0});await processSalesFinance({env,fetchImpl:g.fetchImpl});assert.deepEqual(g.calls,[]);
 await ship(f,{index:1});const order=await readOrder(f.orders[1].id);order.decision.staffApproval.proofHash='obsolete';await savePF(order);assert.equal(await checkoutReadyForCapture(f.checkout),false);await processSalesFinance({env,fetchImpl:g.fetchImpl});assert.deepEqual(g.calls,[]);order.decision.staffApproval.proofHash=order.proof.hash;await savePF(order);await processSalesFinance({env,fetchImpl:g.fetchImpl});assert.equal(g.calls.filter(c=>c==='capture').length,1);
});
test('invalid shipment quantities, future dates and cancellations never capture',async()=>{
 for(const kind of ['short','future','cancelled']){
  const f=await fixture(),g=provider(f);await approve(f,g);await ship(f,kind==='short'?{quantity:1}:kind==='future'?{date:'2099-01-01'}:{});if(kind==='cancelled'){const order=await readOrder(f.orders[0].id);order.pfCancellation={state:'uncertain'};await savePF(order);}assert.equal(await checkoutReadyForCapture(f.checkout),false);await processSalesFinance({env,fetchImpl:g.fetchImpl});assert.equal(g.calls.includes('capture'),false);
 }
});
test('expired authorization and wrong payment identity cannot charge after dispatch',async()=>{
 for(const mode of ['expired','identity']){
  const f=await fixture(),g=provider(f);await approve(f,g);await ship(f);if(mode==='expired')await updateCheckout(f.checkout.id,v=>({...v,authorizationExpiresAt:'2020-01-01'}));else g.payment.id=999;
  await assert.rejects(executeSalesPayment(f.checkout.id,{kind:'capture',amount:10000,key:'dispatch:guard-'+mode},{env,fetchImpl:g.fetchImpl}));assert.equal(g.calls.includes('capture'),false);
 }
});
test('capture timeout and pending provider results stop retries; later reconciliation does not recapture',async()=>{
 for(const pending of [false,true]){
  const f=await fixture(),g=provider(f,{timeout:!pending,pending});await approve(f,g);await ship(f);const input={kind:'capture',amount:10000,key:'dispatch:uncertain'};const result=await executeSalesPayment(f.checkout.id,input,{env,fetchImpl:g.fetchImpl});assert.equal(result.status,'uncertain');await executeSalesPayment(f.checkout.id,input,{env,fetchImpl:g.fetchImpl});await processSalesFinance({env,fetchImpl:g.fetchImpl});assert.equal(g.calls.filter(c=>c==='capture').length,1);
  if(pending){g.payment.operations[1].pending=false;await reconcileSalesPayment(f.checkout.id,{env,fetchImpl:g.fetchImpl});await processSalesFinance({env,fetchImpl:g.fetchImpl});assert.equal((await readCheckout(f.checkout.id)).status,'paid');assert.equal(g.calls.filter(c=>c==='capture').length,1);}
 }
});
test('direct non-finance capture cannot charge a new printed order at proof approval',async()=>{
 const f=await fixture(),g=provider(f);await approve(f,g);await assert.rejects(captureApprovedCheckout(f.checkout.id,{env,fetchImpl:g.fetchImpl}));assert.deepEqual(g.calls,[]);await ship(f);await captureApprovedCheckout(f.checkout.id,{env,fetchImpl:g.fetchImpl});assert.equal(g.calls.filter(c=>c==='capture').length,1);
});
test('historically accepted proof-prepayment is not migrated or automatically captured at dispatch',async()=>{
 const f=await fixture(),g=provider(f);const snapshot={version:'2026-10-27',prepayment:true,prepaymentText:'Accepted old proof-prepayment terms',acceptedAt:'2026-10-28T12:00:00Z',customerType:'consumer'};await updateCheckout(f.checkout.id,v=>({...v,legal:snapshot}));await ship(f);await processSalesFinance({env,fetchImpl:g.fetchImpl});assert.deepEqual(g.calls,[]);assert.deepEqual((await readCheckout(f.checkout.id)).legal,snapshot);assert.equal(proofPrepayment(checkoutPublic(await readCheckout(f.checkout.id))),true);
});
test('new confirmation snapshots dispatch terms and both language policies remove proof prepayment',async()=>{
 for(const locale of ['da','en']){
  const f=await fixture();f.checkout.legal={...legal(true,locale),documents:{terms:'Accepted '+locale+' dispatch terms',privacy:'Privacy'}};await queueOrderConfirmation(f.checkout);const mail=JSON.parse(await readFile(join(root,'order-mail',f.checkout.id+'.json')));assert.equal(mail.paymentTerms,dispatchPaymentText[locale]);assert.ok(mail.text.includes(dispatchPaymentText[locale]));assert.equal(mail.documents.terms,'Accepted '+locale+' dispatch terms');
  const terms=await readFile(new URL('../dist/legal/terms-'+locale+'.html',import.meta.url),'utf8');assert.ok(terms.includes(LEGAL_VERSION));assert.doesNotMatch(terms,/Beløbet hæves, når du har godkendt|Payment is captured after you approve/);
  for(const printed of [true,false])assert.match(paymentDescription([{decorations:printed?[{}]:[]}],locale),locale==='da'?/hæves automatisk, når hele ordren er afsendt/:/captured automatically once the entire order has been dispatched/);
 }
 assert.equal(englishUI[paymentDescription([])],dispatchPaymentText.en);
 const checkoutSource=await readFile(new URL('../dist/checkout.mjs',import.meta.url),'utf8');assert.doesNotMatch(checkoutSource,/proof-prepayment-consent|prepaymentConsent|name="proofPrepayment"/);
});
test('explicitly declined capture is retained without automatic retry or duplicate charge',async()=>{
 const f=await fixture(),g=provider(f,{decline:true});await approve(f,g);await ship(f);await processSalesFinance({env,fetchImpl:g.fetchImpl});await processSalesFinance({env,fetchImpl:g.fetchImpl});assert.equal(g.calls.filter(c=>c==='capture').length,1);const v=await financeView(f.checkout.id);assert.equal(v.operations[0].status,'failed');assert.equal(v.summary.captured,0);assert.equal((await readCheckout(f.checkout.id)).status,'authorized');
});
test('a forged legacy prepayment flag cannot bypass the new dispatch agreement',async()=>{
 const f=await fixture(),g=provider(f);await updateCheckout(f.checkout.id,v=>({...v,legal:{...v.legal,prepayment:true,prepaymentText:'forged proof prepayment'}}));const current=await readCheckout(f.checkout.id);assert.equal(proofPrepayment(current),false);assert.equal(checkoutPublic(current).proofPrepayment,false);await approve(f,g);await assert.rejects(executeSalesPayment(current.id,{kind:'capture',amount:10000,key:'dispatch:cannot-bypass'},{env,fetchImpl:g.fetchImpl}));assert.equal(g.calls.includes('capture'),false);
});
test('cancelled, uncertain and prematurely captured new payments cannot release a proof to production',async()=>{
 for(const status of ['cancelled','capture_reconciliation','paid']){const f=await fixture(),g=provider(f);await updateCheckout(f.checkout.id,v=>({...v,status,paidAt:status==='paid'?new Date().toISOString():null}));await assert.rejects(sendEproofDecision(f.orders[0].id,approval,{env,fetchImpl:g.fetchImpl}));assert.deepEqual(g.calls,[]);}
});
test('new printed checkout reserves through the real Quickpay setup/callback code and captures only on dispatch',async()=>{
 const {createQuickpayLink,applyQuickpayCallback}=await import('../lib/quickpay.mjs');const f=await fixture(),g=provider(f),config={...env,QUICKPAY_PRIVATE_KEY:'synthetic-callback-key',QUICKPAY_AUTH_HOLD_HOURS:'168',SMERCH_PUBLIC_BASE_URL:'http://127.0.0.1:8876'};const accepted=structuredClone(f.checkout.legal);await updateCheckout(f.checkout.id,v=>({...v,status:'prepared',quickpayPaymentId:null,quickpayOrderId:null,paymentAttempt:0}));let link;
 await createQuickpayLink(f.checkout.id,{env:config,fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);if(options.method==='POST'){assert.ok(url.endsWith('/payments'));g.payment.order_id=body.order_id;return Response.json({id:123,order_id:body.order_id});}assert.equal(options.method,'PUT');link=body;return Response.json({url:'https://payment.quickpay.net/payments/synthetic-link'});}});
 assert.equal(link.auto_capture,false);assert.equal(link.amount,10000);assert.equal((await readCheckout(f.checkout.id)).status,'awaiting_payment');await applyQuickpayCallback(g.payment,{env:config});await applyQuickpayCallback(g.payment,{env:config});assert.equal((await readCheckout(f.checkout.id)).status,'authorized');assert.deepEqual((await readCheckout(f.checkout.id)).legal,accepted);
 await approve(f,g);await processSalesFinance({env:config,fetchImpl:g.fetchImpl});assert.deepEqual(g.calls,[]);await ship(f);await processSalesFinance({env:config,fetchImpl:g.fetchImpl});await processSalesFinance({env:config,fetchImpl:g.fetchImpl});assert.equal(g.calls.filter(c=>c==='capture').length,1);assert.deepEqual((await readCheckout(f.checkout.id)).legal,accepted);
});
