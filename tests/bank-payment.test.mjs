import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {prepareBankPayment,applyBankPayment,registerBankPayment} from '../lib/bank-payment.mjs';
import {bankPaymentComplete,productionPaymentActive,supplierPaymentReady} from '../dist/production-payment.mjs';
import {bankInvoiceBasis} from '../lib/bank-invoice-basis.mjs';
import {persistCheckout,readCheckout} from '../lib/checkout.mjs';
import {handoffAuthorizedCheckout,captureApprovedCheckout} from '../lib/order-flow.mjs';
const actor={type:'staff',name:'Testmedarbejder'};
const seed=(decorated=false)=>prepareBankPayment({id:'pay-'+randomUUID(),createdAt:new Date().toISOString(),totalIncVat:500000,quote:{net:396000,vat:99000,lines:[{net:396000,vat:99000,totalIncVat:495000}]},freightExVat:4000,freightIncVat:5000,legal:{customerType:'consumer'},shipping:{name:'Testkunde',email:'test@example.dk'},lines:[{productId:'test',sku:'TEST',quantity:10,decorations:decorated?[{method:'Transfer',position:'Forside',colors:2}]:[]}],pfOrderIds:[],events:[]});
const invoice=o=>applyBankPayment(o,{action:'invoice',invoiceNumber:'TEST-100'},{actor});
const receipt=(o,amount,reference='BANK-1')=>applyBankPayment(o,{action:'receipt',amount,reference,confirmed:true},{actor});
test('invoice is available at any amount to private and business customers; never pre-authorizes production',()=>{for(const customerType of ['consumer','business'])for(const total of [100,500000,5000000]){const o=seed();o.legal.customerType=customerType;o.totalIncVat=total;assert.equal(o.status,'awaiting_bank_payment');assert.equal(supplierPaymentReady(o),false);assert.equal(productionPaymentActive(o),false);}});
test('invoice and staff verification required; partial and duplicate payments do not release production',()=>{const o=seed(true);assert.throws(()=>receipt(o,100),/faktura/);assert.throws(()=>applyBankPayment(o,{action:'invoice',invoiceNumber:'1'},{actor:{type:'customer',name:'Test'}}),/Medarbejder/);invoice(o);receipt(o,100000);receipt(o,100000);assert.equal(o.bankPayment.receipts.length,1);assert.equal(o.status,'awaiting_bank_payment');assert.equal(supplierPaymentReady(o),false);assert.throws(()=>receipt(o,100001),/andet beløb/);assert.throws(()=>receipt(o,400001,'OVER'),/overstiger/);receipt(o,400000,'BANK-2');assert.equal(bankPaymentComplete(o),true);assert.equal(supplierPaymentReady(o),true);assert.equal(productionPaymentActive(o),true);});
test('forged paid or authorized status does not bypass bank payment evidence',()=>{for(const status of ['paid','authorized']){const o=seed();o.status=status;o.authorizationExpiresAt=new Date(Date.now()+86400000).toISOString();assert.equal(supplierPaymentReady(o),false);assert.equal(productionPaymentActive(o),false);}});
test('both blank and decorated unpaid orders stop before PF; bank orders cannot trigger card capture; concurrent receipts are idempotent',async()=>{const directory=await mkdtemp(tmpdir()+'/smerch-bank-');const before=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=directory;try{for(const decorated of [false,true]){const o=invoice(seed(decorated));await persistCheckout(o);let calls=0;const result=await handoffAuthorizedCheckout(o.id,{dispatch:()=>{calls++;throw Error('Must not dispatch');}});assert.equal(result.status,'awaiting_bank_payment');assert.equal(calls,0);await assert.rejects(captureApprovedCheckout(o.id),/Bankbetaling/);await Promise.all([1,2].map(()=>registerBankPayment(o.id,{action:'receipt',amount:100000,reference:'SAME',confirmed:true},{actor})));assert.equal((await readCheckout(o.id)).bankPayment.receipts.length,1);assert.equal((await handoffAuthorizedCheckout(o.id,{})).status,'awaiting_bank_payment');}}finally{if(before===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=before;await rm(directory,{recursive:true,force:true});}});
test('bookkeeper basis contains bank, amounts, decoration, billing and escaped customer details',()=>{const o=seed(true);o.billing={company:'Firma <script>',email:'invoice@example.dk',cvr:'12345678',ean:'1234567890123',reference:'PO-42',street:'Fakturavej 1',postalCode:'1000',city:'København',country:'DK'};const html=bankInvoiceBasis(o);for(const text of ['9070','1637329428','12345678','PO-42','Fakturavej 1','Transfer','Forside','5.000,00','1.000,00','Firma &lt;script&gt;','ikke en faktura'])assert.ok(html.includes(text),text);assert.ok(!html.includes('<script>'));});

import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {prepareCheckout} from '../lib/checkout.mjs';
import {loadPFProduct} from '../lib/pf-catalog-store.mjs';
import {requiresPFReview} from '../dist/pf-review-policy.mjs';
import {approvePFReview,pfReviewState} from '../lib/pf-order-review.mjs';
import {readOrder,dispatchOrder} from '../lib/pf-orders.mjs';
test('fully paid bank order retains private-order review and dispatches once after approval',async()=>{
 const root=await mkdtemp(tmpdir()+'/smerch-bank-paid-'),previous=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=root;
 try{
 const p=await loadPFProduct('pf-120632'),v=p.variants[0],stamp=new Date().toISOString(),catalog={products:[p]},prices={productDate:stamp,printDate:stamp,products:{[v.sku]:{currency:'DKK',tiers:[{min:1,net:100}]}},prints:{}},rules={goodsMarkup:0,printMarkup:0},stock={updatedAt:stamp,items:{[v.sku]:{available:100}}},env={STRIPE_SECRET_KEY:'sk_test_demo',STRIPE_WEBHOOK_SECRET:'whsec_demo',SMERCH_PUBLIC_BASE_URL:'https://example.test',SMERCH_BLANK_SHIPPING_COUNTRY:'PL',SMERCH_FREIGHT_BLANK_EX_VAT_DKK:'40',PF_AUTO_SUBMIT_ENABLED:'1',PF_GATEWAY_MODE:'test',PF_GATEWAY_USERNAME:'test',PF_GATEWAY_PASSWORD:'test',PF_GATEWAY_SENDER_ID:'TEST',PF_COMMUNICATION_EMAIL:'proof@example.test',SMERCH_ARTWORK_SIGNING_SECRET:'x'.repeat(32)};
 const o=prepareCheckout({lines:[{productId:p.id,sku:v.sku,quantity:50,decorations:[]}],shipping:{name:'Demo',email:'demo@example.test',phone:'12345678',street:'Demo 1',postalCode:'2300',city:'København S',country:'DK'}},{catalog,prices,rules,stock,env});o.legal={customerType:'consumer'};prepareBankPayment(o);invoice(o);receipt(o,o.totalIncVat);await persistCheckout(o);assert.equal(requiresPFReview(o),true);
 await handoffAuthorizedCheckout(o.id,{env,catalog,prices,rules,stock});assert.equal((await readCheckout(o.id)).pfOrderIds.length,0);
 await approvePFReview(o.id,{expectedKey:pfReviewState(o).key,actor});let calls=0;const dispatch=async id=>{calls++;const pf=await readOrder(id);pf.status='gateway_accepted';await writeFile(join(root,'orders',id+'.json'),JSON.stringify(pf));return pf;};
 await Promise.all([handoffAuthorizedCheckout(o.id,{env,catalog,prices,rules,stock,dispatch}),handoffAuthorizedCheckout(o.id,{env,catalog,prices,rules,stock,dispatch})]);assert.equal(calls,1);assert.equal((await readCheckout(o.id)).pfHandoff.status,'submitted');await handoffAuthorizedCheckout(o.id,{env,catalog,prices,rules,stock,dispatch});assert.equal(calls,1);
 }finally{if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;await rm(root,{recursive:true,force:true});}
});
import {mkdir,readFile} from 'node:fs/promises';
import {queueOrderConfirmation,confirmationHTML} from '../lib/order-mail.mjs';
test('direct supplier dispatch rejects unpaid bank checkout without making an external request',async()=>{
 const root=await mkdtemp(tmpdir()+'/smerch-bank-dispatch-'),previous=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=root;
 try{const o=seed(),pfId='ord-'+randomUUID();o.pfOrderIds=[pfId];await persistCheckout(o);await mkdir(join(root,'orders'),{recursive:true});await writeFile(join(root,'orders',pfId+'.json'),JSON.stringify({id:pfId,status:'prepared',checkoutId:o.id,gatewayPayload:{Header:{isTest:true}}}));let calls=0;await assert.rejects(dispatchOrder(pfId,{env:{PF_GATEWAY_MODE:'test'},fetchImpl:async()=>{calls++;throw Error('External call forbidden');}}),/betalingsreservation/);assert.equal(calls,0);}finally{if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;await rm(root,{recursive:true,force:true});}
});
test('bank confirmation waits for manual invoice and payment, with no card reservation or shipment claim',async()=>{
 const root=await mkdtemp(tmpdir()+'/smerch-bank-mail-'),previous=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=root;
 try{for(const decorated of [false,true]){const o=seed(decorated);o.legal.locale='da';o.legal.documents={terms:'Test terms'};await queueOrderConfirmation(o);const record=JSON.parse(await readFile(join(root,'order-mail',o.id+'.json'),'utf8'));assert.match(record.text,/Afvent fakturaen/);assert.match(record.nextSteps,/hele betalingen/);assert.doesNotMatch(record.text,/reserveret|klargør dine varer/);assert.match(confirmationHTML(record),/Afvent fakturaen/);assert.equal(record.status,'pending');}}finally{if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;await rm(root,{recursive:true,force:true});}
});
import {queueCounts} from '../dist/admin-work-queue.mjs';
test('invoice requests appear in orders and daily queue without being classified as payment failures',()=>{const o=seed();assert.deepEqual(queueCounts([],[o]),{overview:1,orders:1,proofs:0,production:0,deliveries:0,blocked:0});});
import {registerBankPaymentAndHandoff} from '../lib/bank-payment.mjs';
test('registering full payment starts PF handoff automatically; partial payment does not; supplier failure preserves payment and permits retry',async()=>{
 const root=await mkdtemp(tmpdir()+'/smerch-bank-auto-'),previous=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=root;
 try{const o=invoice(seed(true));await persistCheckout(o);let calls=0;
 const handoff=async paid=>{calls++;assert.equal(paid.status,'paid');assert.equal((await readCheckout(paid.id)).bankPayment.receipts.length,2);throw Error('PF unavailable');};
 const input={action:'receipt',amount:100000,reference:'PART-1',confirmed:true};
 let saved=await registerBankPaymentAndHandoff(o.id,input,{actor,handoff});assert.equal(calls,0);assert.equal(saved.status,'awaiting_bank_payment');
 const final={...input,amount:400000,reference:'PART-2'};
 saved=await registerBankPaymentAndHandoff(o.id,final,{actor,handoff});assert.equal(calls,1);assert.equal(saved.status,'paid');assert.equal(saved.pfHandoff.status,'blocked');assert.equal(saved.pfHandoff.reason,'PF unavailable');
 const successful=async paid=>{calls++;return (await import('../lib/checkout.mjs')).updateCheckout(paid.id,current=>({...current,pfHandoff:{status:'submitted'}}));};
 saved=await registerBankPaymentAndHandoff(o.id,final,{actor,handoff:successful});assert.equal(calls,2);assert.equal(saved.bankPayment.receipts.length,2);assert.equal(saved.pfHandoff.status,'submitted');
 await registerBankPaymentAndHandoff(o.id,final,{actor,handoff:successful});assert.equal(calls,2);
 }finally{if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;await rm(root,{recursive:true,force:true});}
});

test('manual invoice sent is recorded once, permits verified bank receipts and never marks an order paid by itself',()=>{
 const order=seed(),now=Date.now();
 assert.throws(()=>applyBankPayment(order,{action:'invoice_sent'},{actor}),/Bekræft/);
 assert.throws(()=>applyBankPayment({...order,paymentProvider:'quickpay'},{action:'invoice_sent',confirmed:true},{actor}),/bankbetaling/);
 applyBankPayment(order,{action:'invoice_sent',confirmed:true},{actor,now});
 applyBankPayment(order,{action:'invoice_sent',confirmed:true},{actor,now:now+1000});
 assert.equal(order.events.filter(e=>e.type==='bank_invoice_sent').length,1);
 assert.equal(order.bankPayment.invoicedAt,new Date(now).toISOString());
 assert.equal(order.status,'awaiting_bank_payment');assert.equal(supplierPaymentReady(order),false);
 receipt(order,order.totalIncVat);assert.equal(order.status,'paid');
});
