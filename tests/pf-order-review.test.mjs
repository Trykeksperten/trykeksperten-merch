import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {requiresPFReview} from '../dist/pf-review-policy.mjs';
import {pfReviewState,holdForPFReview,approvePFReview,assertPFReviewApproved} from '../lib/pf-order-review.mjs';
import {persistCheckout,readCheckout,updateCheckout,prepareCheckout} from '../lib/checkout.mjs';
import {handoffAuthorizedCheckout} from '../lib/order-flow.mjs';
import {dispatchOrder,prepareOrder,readOrder} from '../lib/pf-orders.mjs';
import {loadPFProduct} from '../lib/pf-catalog-store.mjs';
const previous=process.env.SMERCH_DATA_DIR,root=await mkdtemp(join(tmpdir(),'smerch-pf-review-'));process.env.SMERCH_DATA_DIR=root;
after(async()=>{if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;await rm(root,{recursive:true,force:true});});
const fixture=()=>({id:'pay-'+randomUUID(),status:'authorized',legal:{customerType:'consumer'},lines:[{sku:'DEMO',quantity:1,decorations:[]}],quote:{totalIncVat:500001},totalIncVat:515001,freightIncVat:15000,shipping:{name:'Demo',email:'demo@example.test'},authorizationExpiresAt:new Date(Date.now()+86400000).toISOString(),events:[]});
const actor={type:'staff',name:'Testmedarbejder'};
test('review applies only to consumer all-blank goods strictly above 5000 DKK incl VAT excluding freight',()=>{
 const o=fixture();assert.equal(requiresPFReview(o),true);
 for(const amount of [0,499999,500000])assert.equal(requiresPFReview({...o,quote:{totalIncVat:amount},totalIncVat:amount+100000}),false);
 assert.equal(requiresPFReview({...o,legal:{customerType:'business'}}),false);
 assert.equal(requiresPFReview({...o,lines:[{decorations:[{}]}]}),false);
 assert.equal(requiresPFReview({...o,lines:[...o.lines,{decorations:[{}]}]}),false);
});
test('automatic and manual retry cannot submit before review; duplicate callbacks create one review event',async()=>{
 const o=fixture();await persistCheckout(o);let calls=0;
 for(let i=0;i<2;i++)await handoffAuthorizedCheckout(o.id,{env:{},dispatch:async()=>{calls++;}});
 const stored=await readCheckout(o.id);assert.equal(stored.pfHandoff.status,'awaiting_review');assert.equal(calls,0);assert.equal(stored.pfOrderIds,undefined);assert.equal(stored.events.filter(e=>e.type==='smerch_review_required').length,1);
 assert.equal(stored.status,'authorized');assert.throws(()=>assertPFReviewApproved(stored),/Smerchs godkendelse/);
});
test('staff approval records actor and time, rejects stale revisions and expired reservations, and becomes invalid after edits',async()=>{
 const o=fixture();await persistCheckout(o);const key=pfReviewState(o).key;
 await assert.rejects(approvePFReview(o.id,{expectedKey:key}),/Medarbejder/);await assert.rejects(approvePFReview(o.id,{expectedKey:'old',actor}),/ændret/);
 await approvePFReview(o.id,{expectedKey:key,actor});await approvePFReview(o.id,{expectedKey:key,actor});let saved=await readCheckout(o.id);assert.equal(saved.events.filter(e=>e.type==='smerch_review_approved').length,1);assert.equal(pfReviewState(saved).approved,true);assert.equal(saved.pfReviewApproval.actor.name,actor.name);assert.ok(saved.pfReviewApproval.at);assert.doesNotThrow(()=>assertPFReviewApproved(saved));
 await updateCheckout(o.id,c=>{c.shipping.street='En ny adresse';return c;});saved=await readCheckout(o.id);assert.equal(pfReviewState(saved).approved,false);assert.throws(()=>assertPFReviewApproved(saved));assert.equal(await holdForPFReview(o.id),true);
 await updateCheckout(o.id,c=>{c.authorizationExpiresAt=new Date(0).toISOString();return c;});await assert.rejects(approvePFReview(o.id,{expectedKey:pfReviewState(await readCheckout(o.id)).key,actor}),/reservation/);
});
test('direct PF dispatch cannot bypass the review gate',async()=>{
 const o=fixture(),pfId='ord-'+randomUUID();o.pfOrderIds=[pfId];await persistCheckout(o);await mkdir(join(root,'orders'),{recursive:true});await writeFile(join(root,'orders',pfId+'.json'),JSON.stringify({id:pfId,status:'prepared',checkoutId:o.id,gatewayPayload:{Header:{isTest:true}}}));let calls=0;
 await assert.rejects(dispatchOrder(pfId,{env:{PF_GATEWAY_MODE:'test'},fetchImpl:async()=>{calls++;throw Error('No external calls');}}),/Smerchs godkendelse/);assert.equal(calls,0);
});
test('approved blank order passes to mocked PF once; current stock and pricing are still validated',async()=>{
 const p=await loadPFProduct('pf-120632'),v=p.variants[0],stamp=new Date().toISOString(),catalog={products:[p]},prices={productDate:stamp,printDate:stamp,products:{[v.sku]:{currency:'DKK',tiers:[{min:1,net:100}]}},prints:{}},rules={goodsMarkup:0,printMarkup:0},stock={updatedAt:stamp,items:{[v.sku]:{available:100}}},env={STRIPE_SECRET_KEY:'sk_test_demo',STRIPE_WEBHOOK_SECRET:'whsec_demo',SMERCH_PUBLIC_BASE_URL:'https://example.test',SMERCH_BLANK_SHIPPING_COUNTRY:'PL',SMERCH_FREIGHT_BLANK_EX_VAT_DKK:'40',PF_AUTO_SUBMIT_ENABLED:'1',PF_GATEWAY_MODE:'test',PF_GATEWAY_USERNAME:'test',PF_GATEWAY_PASSWORD:'test',PF_GATEWAY_SENDER_ID:'TEST',PF_COMMUNICATION_EMAIL:'proof@example.test',SMERCH_ARTWORK_SIGNING_SECRET:'x'.repeat(32)};
 const o=prepareCheckout({lines:[{productId:p.id,sku:v.sku,quantity:50,decorations:[]}],shipping:{name:'Demo',email:'demo@example.test',phone:'12345678',street:'Demo 1',postalCode:'2300',city:'København S',country:'DK'}},{catalog,prices,rules,stock,env});o.legal={customerType:'consumer'};o.status='authorized';o.authorizationExpiresAt=new Date(Date.now()+86400000).toISOString();await persistCheckout(o);assert.equal(requiresPFReview(o),true);
 await handoffAuthorizedCheckout(o.id,{env,catalog,prices,rules,stock});assert.equal((await readCheckout(o.id)).pfOrderIds.length,0);
 await approvePFReview(o.id,{expectedKey:pfReviewState(o).key,actor});let calls=0;const dispatch=async id=>{calls++;const pf=await readOrder(id);pf.status='gateway_accepted';await writeFile(join(root,'orders',id+'.json'),JSON.stringify(pf));return pf;};
 await Promise.all([handoffAuthorizedCheckout(o.id,{env,catalog,prices,rules,stock,dispatch}),handoffAuthorizedCheckout(o.id,{env,catalog,prices,rules,stock,dispatch})]);assert.equal(calls,1);assert.equal((await readCheckout(o.id)).pfHandoff.status,'submitted');await handoffAuthorizedCheckout(o.id,{env,catalog,prices,rules,stock,dispatch});assert.equal(calls,1);
});
test('review queue is an actionable order rather than a PF error or payment attempt',async()=>{
 const {queueCounts}=await import('../dist/admin-work-queue.mjs'),{isUnfinishedPayment}=await import('../dist/admin-order-list.mjs');const o=fixture();o.pfHandoff={status:'awaiting_review'};
 assert.equal(isUnfinishedPayment(o,[]),false);assert.deepEqual(queueCounts([],[o]),{overview:1,orders:1,proofs:0,production:0,deliveries:0,blocked:0});
});
