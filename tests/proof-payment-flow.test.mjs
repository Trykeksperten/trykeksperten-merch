import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {sendEproofDecision,readOrder,approveProofPayment,recordApprovalDelivery} from '../lib/pf-orders.mjs';
import {readCheckout,persistCheckout,checkoutPublic} from '../lib/checkout.mjs';
import {checkoutReadyForCapture} from '../lib/order-flow.mjs';
import {validateCheckoutConsent,LEGAL_VERSION} from '../dist/legal-consent.mjs';
const root=await mkdtemp(join(tmpdir(),'proof-payment-'));process.env.SMERCH_DATA_DIR=root;
after(()=>rm(root,{recursive:true,force:true}));
const env={PF_EPROOF_ENABLED:'1',PF_EPROOF_MODE:'test',PF_GATEWAY_SENDER_ID:'SMERCH',PF_GATEWAY_USERNAME:'user',PF_GATEWAY_TEST_PASSWORD:'test',QUICKPAY_MODE:'test',QUICKPAY_API_KEY:'test',QUICKPAY_CAPTURE_ENABLED:'1'};
const staff={type:'staff',name:'Reviewer'},input={version:1,confirmed:true,performedBy:staff};
async function saveOrder(order){await mkdir(join(root,'orders'),{recursive:true});await writeFile(join(root,'orders',order.id+'.json'),JSON.stringify(order));}
async function fixture(count=1){
 const checkout={id:'pay-'+randomUUID(),status:'authorized',paymentProvider:'quickpay',totalIncVat:10000,quickpayPaymentId:123,quickpayOrderId:randomUUID(),authorizationExpiresAt:new Date(Date.now()+3600000).toISOString(),legal:validateCheckoutConsent({version:LEGAL_VERSION,locale:'da',customerType:'consumer',accepted:true,personalised:true,prepayment:true}),lines:[{sku:'sku',quantity:1,decorations:[{}]}],pfOrderIds:[],fulfillment:{groups:[]},events:[]};
 const orders=[];for(let i=0;i<count;i++){const id='ord-'+randomUUID(),proof={version:1,hash:'hash'+i,api:{mode:'test',configurations:[{reference:'ref'+i,url:'https://pf.example/proof',SKUs:[{sku:'sku',lineReference:'line'}]}]}};const order={id,checkoutId:checkout.id,purchaseOrderNumber:'SMERCH-'+id.slice(4),pfOrderNumber:123,proof,proofs:[proof],status:'approval_pending_pf',gatewayPayload:{Header:{isTest:true}},decision:{decision:'approve',actor:'customer',version:1,proofHash:proof.hash},events:[]};orders.push(order);checkout.pfOrderIds.push(id);checkout.fulfillment.groups.push({});await saveOrder(order);}await persistCheckout(checkout);return {checkout,orders};
}
function gateway(f,{pending=false,timeout=false,pfTimeout=false}={}){const calls=[];const payment={id:123,order_id:f.checkout.quickpayOrderId,type:'Payment',currency:'DKK',test_mode:true,accepted:true,link:{amount:10000},operations:[{id:1,type:'authorize',amount:10000,pending:false,qp_status_code:'20000',created_at:new Date().toISOString()}]};return {calls,payment,fetchImpl:async(url,options)=>{if(url.startsWith('https://api.quickpay.net')){if(options.method==='POST'){calls.push('capture');assert.equal(JSON.parse(options.body).amount,10000);if(timeout)throw Error('network timeout');payment.operations.push({id:2,type:'capture',amount:10000,pending,qp_status_code:'20000',created_at:new Date().toISOString()});}return new Response(JSON.stringify(payment));}calls.push('pf');assert.equal((await readCheckout(f.checkout.id)).status,'paid');if(pfTimeout)throw Error('PF timeout');return new Response('{}');}};}
test('consent must be a separate true boolean; snapshot stores wording and version; bank is separate',()=>{
 const c={version:LEGAL_VERSION,locale:'da',customerType:'consumer',accepted:true,personalised:true};for(const prepayment of [undefined,false,'true'])assert.throws(()=>validateCheckoutConsent({...c,prepayment}));const legal=validateCheckoutConsent({...c,prepayment:true});assert.equal(legal.prepayment,true);assert.match(legal.prepaymentText,/Smerchs interne/);assert.ok(legal.acceptedAt);assert.equal(validateCheckoutConsent(c,Date.now(),{bankTransfer:true}).prepayment,false);
});
test('customer approval alone cannot capture; staff review captures before PF; double click cannot charge twice',async()=>{
 const f=await fixture(),g=gateway(f);assert.equal(await checkoutReadyForCapture(f.checkout),false);
 const outcomes=await Promise.allSettled([1,2].map(()=>sendEproofDecision(f.orders[0].id,input,{env,fetchImpl:g.fetchImpl})));
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(g.calls,['capture','pf']);assert.equal((await readCheckout(f.checkout.id)).status,'paid');assert.equal((await readOrder(f.orders[0].id)).decision.staffApproval.performedBy.name,'Reviewer');
});
test('pending capture and timeout never release PF; provider confirmation permits retry without recapture',async()=>{
 for(const options of [{pending:true},{timeout:true}]){const f=await fixture(),g=gateway(f,options);await assert.rejects(sendEproofDecision(f.orders[0].id,input,{env,fetchImpl:g.fetchImpl}));assert.deepEqual(g.calls,['capture']);assert.equal((await readCheckout(f.checkout.id)).status,'capture_reconciliation');await assert.rejects(sendEproofDecision(f.orders[0].id,input,{env,fetchImpl:g.fetchImpl}));assert.deepEqual(g.calls,['capture']);
 const paid=await readCheckout(f.checkout.id);paid.status='paid';paid.paidAt=new Date().toISOString();await persistCheckout(paid);await sendEproofDecision(f.orders[0].id,input,{env,fetchImpl:g.fetchImpl});assert.deepEqual(g.calls,['capture','pf']);}
});
test('every current proof needs customer and staff approval before full capture',async()=>{
 const f=await fixture(2),g=gateway(f);const first=await sendEproofDecision(f.orders[0].id,input,{env,fetchImpl:g.fetchImpl});assert.equal(first.state,'awaiting_other_proofs');assert.deepEqual(g.calls,[]);await sendEproofDecision(f.orders[1].id,input,{env,fetchImpl:g.fetchImpl});await sendEproofDecision(f.orders[0].id,input,{env,fetchImpl:g.fetchImpl});assert.deepEqual(g.calls,['capture','pf','pf']);
});
test('manual channel cannot bypass capture and staff review',async()=>{
 const f=await fixture(),g=gateway(f),id=f.orders[0].id;await assert.rejects(recordApprovalDelivery(id,{channel:'PF Store',reference:'test',performedBy:staff}));await approveProofPayment(id,input,{env,fetchImpl:g.fetchImpl});assert.deepEqual(g.calls,['capture']);await recordApprovalDelivery(id,{channel:'PF Store',reference:'test',performedBy:staff});
});
test('stale version, missing confirmation and missing capture flag cannot send or charge',async()=>{
 for(const patch of [{version:2},{confirmed:false},{performedBy:null}]){const f=await fixture(),g=gateway(f);await assert.rejects(sendEproofDecision(f.orders[0].id,{...input,...patch},{env,fetchImpl:g.fetchImpl}));assert.deepEqual(g.calls,[]);}const f=await fixture(),g=gateway(f);await assert.rejects(sendEproofDecision(f.orders[0].id,input,{env:{...env,QUICKPAY_CAPTURE_ENABLED:'0'},fetchImpl:g.fetchImpl}));assert.deepEqual(g.calls,[]);
});
test('rejection does not charge, and PF timeout after payment blocks another send',async()=>{
 const f=await fixture(),g=gateway(f,{pfTimeout:true});await assert.rejects(sendEproofDecision(f.orders[0].id,input,{env,fetchImpl:g.fetchImpl}));await assert.rejects(sendEproofDecision(f.orders[0].id,input,{env,fetchImpl:g.fetchImpl}));assert.deepEqual(g.calls,['capture','pf']);
 const h=await fixture(),o=h.orders[0];o.status='revision_requested';o.decision.decision='reject';o.decision.comment='Ret logo';await saveOrder(o);let sends=0;await sendEproofDecision(o.id,input,{env,fetchImpl:async url=>{assert.ok(!url.includes('quickpay'));sends++;return new Response('{}');}});assert.equal(sends,1);assert.equal((await readCheckout(h.checkout.id)).status,'authorized');
});
test('legacy checkout cannot be captured before dispatch; obsolete staff approval cannot capture',async()=>{
 const f=await fixture(),g=gateway(f);f.checkout.legal.prepayment=false;await persistCheckout(f.checkout);await assert.rejects(approveProofPayment(f.orders[0].id,input,{env,fetchImpl:g.fetchImpl}),/særskilte accept/);assert.equal(await checkoutReadyForCapture(f.checkout),false);assert.deepEqual(g.calls,[]);
 const h=await fixture(),o=h.orders[0];o.decision.staffApproval={version:0,proofHash:o.proof.hash,performedBy:staff};await saveOrder(o);assert.equal(await checkoutReadyForCapture(h.checkout),false);
});
test('enabled finance ledger captures before production once and records the confirmed operation',async()=>{
 const f=await fixture(),g=gateway(f);f.checkout.shipping={country:'DK'};f.checkout.quote={net:8000,lines:[{net:8000}]};f.checkout.freightExVat=0;await persistCheckout(f.checkout);
 await sendEproofDecision(f.orders[0].id,input,{env:{...env,SMERCH_FINANCE_ENABLED:'1',SMERCH_PAYMENT_AGREEMENT_CONFIRMED:'1'},fetchImpl:g.fetchImpl});
 assert.deepEqual(g.calls,['capture','pf']);assert.equal((await readCheckout(f.checkout.id)).status,'paid');const {financeView}=await import('../lib/sales-ledger.mjs');const view=await financeView(f.checkout.id);assert.equal(view.operations[0].status,'confirmed');assert.equal(view.operations[0].amount,10000);
});

test('admin payment policy works with the public checkout response used by the detail view',async()=>{const {proofPrepayment}=await import('../dist/proof-payment-policy.mjs');const f=await fixture();assert.equal(proofPrepayment(checkoutPublic(f.checkout)),true);f.checkout.legal.prepayment=false;assert.equal(proofPrepayment(checkoutPublic(f.checkout)),false);});
