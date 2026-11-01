import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {prepareBankPayment,applyBankPayment,registerBankPaymentAndHandoff,publicBankPayment} from '../lib/bank-payment.mjs';
import {persistCheckout,readCheckout,updateCheckout} from '../lib/checkout.mjs';
import {bankPaymentComplete} from '../lib/production-payment.mjs';
import {appendBankPayment} from '../dist/admin-bank-payment.mjs';
const root=await mkdtemp('/tmp/smerch-bank-recovery-'),previous=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=root;
after(async()=>{if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;await rm(root,{recursive:true,force:true});});
const actor={type:'staff',name:'Testmedarbejder'},oldAt='2026-10-01T12:00:00.000Z';
const seed=()=>prepareBankPayment({id:'pay-'+randomUUID(),createdAt:oldAt,totalIncVat:10000,legal:{customerType:'consumer'},lines:[],events:[],shipping:{email:'test@example.invalid'}});
const invoiceSent=order=>applyBankPayment(order,{action:'invoice_sent',confirmed:true},{actor,now:Date.parse(oldAt)});
const receipt={action:'receipt',confirmed:true,amount:10000,reference:'BANK-TEST-1'};
function historical(){const o=invoiceSent(seed());o.status='paid';o.paidAt=oldAt;o.pfHandoff={status:'ready'};o.bankPayment.receipts=[{amount:10000,reference:'BANK-OLD',at:oldAt,actor}];o.events.push({type:'bank_payment_received',at:oldAt,amount:10000,reference:'BANK-OLD',performedBy:actor});return o;}

test('invoice_sent cannot accept money until an invoice number is recorded; full receipt then hands off once',async()=>{
 const o=invoiceSent(seed());await persistCheckout(o);let calls=0;
 const handoff=order=>{calls++;return updateCheckout(order.id,current=>({...current,pfHandoff:{status:'submitted'}}));};
 await assert.rejects(registerBankPaymentAndHandoff(o.id,receipt,{actor,handoff}),/fakturanummer/);assert.equal((await readCheckout(o.id)).bankPayment.receipts.length,0);assert.equal(calls,0);
 await registerBankPaymentAndHandoff(o.id,{action:'invoice',invoiceNumber:'INV-NEW'},{actor,handoff});assert.equal(calls,0);
 await registerBankPaymentAndHandoff(o.id,receipt,{actor,handoff});await registerBankPaymentAndHandoff(o.id,receipt,{actor,handoff});
 const saved=await readCheckout(o.id);assert.equal(calls,1);assert.equal(saved.bankPayment.receipts.length,1);assert.equal(saved.bankPayment.invoicedAt,oldAt);assert.equal(bankPaymentComplete(saved),true);
});

test('adding the missing number recovers a historical paid order without altering payment evidence or recording money again',async()=>{
 const o=historical(),evidence=structuredClone({receipts:o.bankPayment.receipts,paidAt:o.paidAt,events:o.events});await persistCheckout(o);let calls=0;
 const handoff=async order=>{calls++;assert.equal(bankPaymentComplete(order),true);return updateCheckout(order.id,current=>({...current,pfHandoff:{status:'submitted'}}));};
 const input={action:'invoice',invoiceNumber:'INV-RECOVERED'};
 await registerBankPaymentAndHandoff(o.id,input,{actor,handoff});await registerBankPaymentAndHandoff(o.id,input,{actor,handoff});
 const saved=await readCheckout(o.id);assert.equal(calls,1);assert.equal(saved.bankPayment.invoicedAt,oldAt);assert.deepEqual(saved.bankPayment.receipts,evidence.receipts);assert.equal(saved.paidAt,evidence.paidAt);assert.deepEqual(saved.events.slice(0,evidence.events.length),evidence.events);assert.equal(saved.events.filter(e=>e.type==='bank_payment_received').length,1);assert.equal(saved.events.filter(e=>e.type==='bank_invoice_registered').length,1);
 await assert.rejects(registerBankPaymentAndHandoff(o.id,{...input,invoiceNumber:'OTHER'},{actor,handoff}),/allerede registreret/);
});

test('historical recovery persists invoice and payment evidence even if handoff fails; same number permits safe retry',async()=>{
 const o=historical();await persistCheckout(o);const input={action:'invoice',invoiceNumber:'INV-RETRY'};
 await registerBankPaymentAndHandoff(o.id,input,{actor,handoff:async()=>{throw Error('PF unavailable');}});
 const failed=await readCheckout(o.id);assert.equal(failed.status,'paid');assert.equal(failed.pfHandoff.status,'blocked');assert.deepEqual(failed.bankPayment.receipts,o.bankPayment.receipts);
 const saved=await registerBankPaymentAndHandoff(o.id,input,{actor,handoff:order=>updateCheckout(order.id,current=>({...current,pfHandoff:{status:'submitted'}}))});assert.equal(saved.pfHandoff.status,'submitted');assert.equal(saved.bankPayment.receipts.length,1);
});

test('invoice metadata cannot manufacture full payment for a historical paid flag with insufficient receipts',async()=>{
 const o=historical();o.bankPayment.receipts[0].amount=1;await persistCheckout(o);let calls=0;
 const saved=await registerBankPaymentAndHandoff(o.id,{action:'invoice',invoiceNumber:'INV-INCOMPLETE'},{actor,handoff:async()=>{calls++;}});assert.equal(calls,0);assert.equal(bankPaymentComplete(saved),false);assert.equal(saved.bankPayment.receipts[0].amount,1);
});

class Element{constructor(tag){this.tag=tag;this.children=[];this.textContent='';}append(...nodes){this.children.push(...nodes);}}
const all=node=>[node,...node.children.flatMap(all)];
test('bank UI keeps the missing invoice form visible after invoice_sent and repairs historical paid orders with one invoice action',async()=>{
 const prior={document:globalThis.document,fetch:globalThis.fetch,location:globalThis.location};globalThis.document={createElement:tag=>new Element(tag)};
 try{
  for(const o of [invoiceSent(seed()),historical()]){const box=new Element('div');appendBankPayment(box,{...o,bankPayment:publicBankPayment(o)});assert.equal(all(box).filter(n=>n.tag==='form').length,1);assert.ok(all(box).some(n=>n.textContent==='Fakturanummer fra e-conomic'));assert.ok(!all(box).some(n=>n.textContent==='Registrér betaling · send ved fuld betaling'));assert.ok(!all(box).some(n=>n.textContent==='Kontrollér og send betalt ordre til PF'));}
  const o=historical();await persistCheckout(o);let posts=0,handoffs=0,reloads=0;globalThis.location={reload(){reloads++;}};globalThis.fetch=async(url,options)=>{posts++;const input=JSON.parse(options.body);assert.deepEqual(input,{action:'invoice',invoiceNumber:'INV-UI'});await registerBankPaymentAndHandoff(o.id,input,{actor,handoff:order=>{handoffs++;return updateCheckout(order.id,current=>({...current,pfHandoff:{status:'submitted'}}));}});return {ok:true,json:async()=>({})};};
  const box=new Element('div');appendBankPayment(box,{...o,bankPayment:publicBankPayment(o)});const form=all(box).find(n=>n.tag==='form');all(form).find(n=>n.tag==='input').value='INV-UI';await Promise.all([1,2].map(()=>form.onsubmit({preventDefault(){}})));assert.equal(posts,1);assert.equal(handoffs,1);assert.equal(reloads,1);assert.equal((await readCheckout(o.id)).bankPayment.receipts.length,1);
 }finally{Object.assign(globalThis,prior);}
});
