import test from 'node:test';
import assert from 'node:assert/strict';
import {matchedPaymentAttempts} from '../dist/payment-attempt-matching.mjs';
const line={productId:'cap',sku:'123',quantity:10,decorations:[{method:'Broderi',position:'Forside',colors:1,pantone:'717 C',logos:['logo.ai']}]};
const attempt={id:'attempt',status:'awaiting_payment',createdAt:'2026-10-23T12:36:00Z',shipping:{email:'test@example.test'},totalIncVat:124613,lines:[line]};
const ordered={...attempt,id:'order',status:'authorized',createdAt:'2026-10-23T12:51:00Z',pfOrderIds:['pf-1']};
const match=(a=attempt,candidates=[ordered])=>matchedPaymentAttempts([a,...candidates],[{id:'pf-1',checkoutId:'order'}]);
test('a unique later order with identical customer, amount and design gets the attempt without changing records',()=>{
 const input=[structuredClone(attempt),structuredClone(ordered)],before=structuredClone(input);const result=matchedPaymentAttempts(input);
 assert.equal(result.get('order')[0].id,'attempt');assert.deepEqual(input,before);
});
test('same customer alone never joins different purchases',()=>{
 for(const changed of [{totalIncVat:999},{lines:[{...line,quantity:20}]},{lines:[{...line,decorations:[{...line.decorations[0],pantone:'Black C'}]}]},{shipping:{email:'other@example.test'}}])assert.equal(match({...attempt,...changed}).size,0);
});
test('ambiguous orders are left unmatched',()=>{
 assert.equal(match(attempt,[ordered,{...ordered,id:'second-order'}]).size,0);
});
test('missing matching evidence and unrelated dates do not attach attempts',()=>{
 for(const changed of [{shipping:{}},{lines:[]},{totalIncVat:null},{createdAt:'invalid'},{createdAt:'2026-10-20T12:36:00Z'},{createdAt:'2026-10-24T12:36:00Z'}])assert.equal(match({...attempt,...changed}).size,0);
});
test('email case and snapshot object key order do not block otherwise identical attempts',()=>{
 assert.equal(match({...attempt,shipping:{email:' TEST@example.test '},lines:[{decorations:line.decorations,quantity:10,sku:'123',productId:'cap'}]}).get('order').length,1);
});
test('successful or linked payments never appear as failed attempts',()=>{
 for(const changed of [{status:'paid'},{paidAt:'2026-10-23T12:40:00Z'},{pfOrderIds:['pf-other']}])assert.equal(match({...attempt,...changed}).size,0);
});
test('an authorized checkout without a PF order cannot hide a previous attempt',()=>{
 assert.equal(matchedPaymentAttempts([attempt,{...ordered,pfOrderIds:[]}]).size,0);
});
