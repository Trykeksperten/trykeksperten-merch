import test from 'node:test';
import assert from 'node:assert/strict';
import {isUnfinishedPayment} from '../dist/admin-order-list.mjs';
test('unfinished and cancelled unlinked attempts are separate; real reservations, paid and PF-linked orders stay visible',()=>{for(const status of ['awaiting_payment','expired','payment_failed','cancelled'])assert.equal(isUnfinishedPayment({status,pfOrderIds:[]}),true);for(const status of ['authorized','paid','capture_reconciliation','needs_attention','authorization_expired'])assert.equal(isUnfinishedPayment({status,pfOrderIds:[]}),false);assert.equal(isUnfinishedPayment({status:'cancelled',pfOrderIds:['ord-real']}),false);assert.equal(isUnfinishedPayment({status:'awaiting_payment'},[{id:'ord-real'}]),false);assert.equal(isUnfinishedPayment({status:'cancelled',paidAt:'2026-10-23'}),false);});

test('payment details open and close without a legacy checkout element',async()=>{
  const {appendPaymentAttemptDetails}=await import('../dist/admin-payment-attempt.mjs');
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.classList={add:()=>{}};}
    append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
    replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    setAttribute(key,value){this.attributes[key]=value;}
  }
  const previous=globalThis.document;
  globalThis.document={createElement:tag=>new Element(tag)};
  try{
    const row=new Element('article'),button=new Element('button');
    appendPaymentAttemptDetails(row,button,{id:'attempt-1',status:'awaiting_payment',totalIncVat:500000,paymentProvider:'quickpay',quickpayPaymentId:123,shipping:{name:'Testkunde'}});
    row.append(button);
    assert.equal(button.attributes['aria-expanded'],'false');
    button.onclick();
    const details=row.children[1];
    assert.equal(details.hidden,false);
    assert.equal(button.attributes['aria-controls'],details.id);
    assert.equal(button.attributes['aria-expanded'],'true');
    const text=node=>[node.textContent||'',...node.children.map(text)].join(' ');
    assert.match(text(details),/Afventer betaling/);
    assert.match(text(details),/5.000,00/);
    assert.match(text(details),/123/);
    button.onclick();
    assert.equal(details.hidden,true);
    button.onclick();
    assert.equal(details.hidden,false);
    assert.equal(row.children.length,2,'reopening reuses the same details');
  }finally{globalThis.document=previous;}
});
