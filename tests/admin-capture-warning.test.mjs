import test from 'node:test';
import assert from 'node:assert/strict';
import {captureWarning,appendCaptureWarning} from '../dist/admin-capture-warning.mjs';
import {appendOrderSummaryState} from '../dist/admin-order-summary.mjs';
import {workQueue,queueCounts} from '../dist/admin-work-queue.mjs';
const day=86400000,at=Date.parse('2026-10-20T10:00:00Z');
const order={id:'pay-test',paymentProvider:'quickpay',status:'authorized',totalIncVat:10000,authorizedAt:new Date(at).toISOString()};
test('warns during the final 24 hours; elapsed time stays accurate across Danish daylight saving',()=>{
 assert.equal(captureWarning(order,{now:at+6*day-1}),null);
 const warning=captureWarning(order,{now:at+6*day});assert.equal(warning.overdue,false);assert.equal(warning.deadlineAt,'2026-10-27T10:00:00.000Z');assert.match(warning.message,/27.10.2026, 11.00/);
 assert.equal(captureWarning(order,{now:at+7*day-1}).overdue,false);
 assert.equal(captureWarning(order,{now:at+7*day}).overdue,true);
 assert.equal(captureWarning(order,{now:at+40*day}).overdue,true);
});
test('uses the gateway authorization clock instead of a delayed callback or order creation',()=>{
 const gateway={...order,createdAt:'2020-01-01',authorizedAt:new Date(at+2*day).toISOString(),captureDeadlinePolicy:'clearhaus-179-days',authorizationExpiresAt:new Date(at+179*day).toISOString()};
 assert.equal(captureWarning(gateway,{now:at+6*day}).deadlineAt,'2026-10-27T10:00:00.000Z');
 assert.equal(captureWarning({...order,authorizedAt:undefined},{now:at+6*day}),null);
 assert.equal(captureWarning({...order,authorizedAt:'broken'},{now:at+6*day}),null);
});
test('paid, refunded, cancelled, bank, stripe and sandbox records do not raise outstanding card alerts',()=>{
 for(const status of ['paid','refunded','cancelled','awaiting_payment','payment_failed','authorization_expired'])assert.equal(captureWarning({...order,status},{now:at+7*day}),null,status);
 for(const change of [{paidAt:new Date(at).toISOString()},{paymentTotals:{captured:10000}},{paymentProvider:'bank_transfer'},{paymentProvider:'stripe'},{adminTest:true}])assert.equal(captureWarning({...order,...change},{now:at+7*day}),null);
 for(const status of ['partially_paid','capture_reconciliation'])assert.ok(captureWarning({...order,status,paymentTotals:{captured:100}},{now:at+7*day}));
});
class Element{constructor(tag){this.tag=tag;this.children=[];this.attributes={};}append(...n){this.children.push(...n);}setAttribute(k,v){this.attributes[k]=v;}}
const all=n=>[n,...n.children.flatMap(all)];
test('shared overview warnings are visible and bring PF-waiting orders into today and attention counts',()=>{
 const before=globalThis.document,clock=Date.now;globalThis.document={createElement:tag=>new Element(tag)};Date.now=()=>at+6*day;
 try{
  const state=new Element('div'),pf={id:'ord-test',checkoutId:order.id,status:'processing',lines:[]};appendOrderSummaryState(state,order,[pf]);
  const box=all(state).find(n=>n.className==='capture-warning');assert.equal(box.attributes.role,'status');assert.match(box.children[0].textContent,/24 timer/);
  assert.ok(workQueue([pf],[order])[0].blockers.some(p=>p.includes('7-dagesgrænsen')));assert.equal(queueCounts([pf],[order]).overview,1);
  assert.equal(queueCounts([pf],[{...order,status:'paid',paidAt:new Date(at).toISOString()}]).overview,0);
  const none=new Element('div');appendCaptureWarning(none,{...order,status:'paid'});assert.equal(none.children.length,0);
 }finally{globalThis.document=before;Date.now=clock;}
});
