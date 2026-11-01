import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {persistCheckout,readCheckout,updateCheckout,cancelCheckout,applyStripeEvent,captureCheckout} from '../lib/checkout.mjs';
import {db,closeDatabases} from '../lib/backoffice/database.mjs';
const root=await mkdtemp('/tmp/smerch-stripe-cancel-'),prior={root:process.env.SMERCH_DATA_DIR,mode:process.env.SMERCH_DATABASE_ENABLED};process.env.SMERCH_DATA_DIR=root;process.env.SMERCH_DATABASE_ENABLED='0';
after(async()=>{closeDatabases();await rm(root,{recursive:true,force:true});for(const [key,value] of [['SMERCH_DATA_DIR',prior.root],['SMERCH_DATABASE_ENABLED',prior.mode]])if(value===undefined)delete process.env[key];else process.env[key]=value;});
const env={STRIPE_SECRET_KEY:'sk_test_fixture'},response=(data,ok=true)=>({ok,json:async()=>structuredClone(data)});
async function fixture(){const o={id:'pay-'+randomUUID(),paymentProvider:'stripe',paymentMode:'test',stripeSessionId:'cs_test_'+randomUUID().replaceAll('-',''),status:'awaiting_payment',createdAt:new Date().toISOString(),totalIncVat:10000,events:[],pfOrderIds:[]};await persistCheckout(o);return o;}
const session=(o,changes={})=>({id:o.stripeSessionId,livemode:false,mode:'payment',status:'open',payment_status:'unpaid',currency:'dkk',amount_total:10000,metadata:{checkout_id:o.id},payment_intent:null,...changes});
const intent=(o,changes={})=>({id:'pi_fixture',livemode:false,status:'requires_capture',currency:'dkk',amount:10000,amount_received:0,amount_capturable:10000,metadata:{checkout_id:o.id},...changes});
const event=(o,type,object)=>({id:'evt_'+randomUUID(),type,livemode:false,data:{object:{metadata:{checkout_id:o.id},...object}}});

for(const mode of ['0','1'])test(`open Stripe Checkout closes and is verified before local cancellation (${mode})`,async()=>{
 process.env.SMERCH_DATABASE_ENABLED=mode;try{const o=await fixture(),calls=[];let closed=false;const fetchImpl=async(url,options)=>{calls.push([options.method,url]);assert.equal((await readCheckout(o.id)).status,'cancellation_reconciliation');if(options.method==='POST'){assert.match(url,/\/expire$/);assert.equal(options.headers['Idempotency-Key'],'smerch-expire-'+o.stripeSessionId);closed=true;}return response(session(o,{status:closed?'expired':'open'}));};await Promise.all([cancelCheckout(o.id,{env,fetchImpl}),cancelCheckout(o.id,{env,fetchImpl})]);const saved=await readCheckout(o.id);assert.equal(saved.status,'cancelled');assert.equal(saved.stripeCancellation.status,'confirmed');assert.deepEqual(calls.map(c=>c[0]),['GET','POST','GET']);await cancelCheckout(o.id,{env,fetchImpl});assert.equal(calls.length,3);}finally{closeDatabases();process.env.SMERCH_DATABASE_ENABLED='0';}
});
test('completion racing with session expiry discovers and cancels its authorization before local cancellation',async()=>{
 const o=await fixture(),calls=[];let completed=false,cancelled=false;
 const fetchImpl=async(url,options)=>{calls.push([options.method,url]);if(url.endsWith('/expire')){
  completed=true;await applyStripeEvent(event(o,'checkout.session.completed',session(o,{status:'complete',payment_intent:'pi_fixture'})));assert.equal((await readCheckout(o.id)).status,'needs_attention');return response({error:{message:'already complete'}},false);
 }if(url.endsWith('/cancel')){cancelled=true;return response(intent(o,{status:'canceled'}));}if(url.includes('/checkout/sessions/'))return response(session(o,{status:completed?'complete':'open',payment_intent:completed?'pi_fixture':null}));return response(intent(o,{status:cancelled?'canceled':'requires_capture'}));};
 await cancelCheckout(o.id,{env,fetchImpl});const saved=await readCheckout(o.id);assert.equal(saved.status,'cancelled');assert.equal(saved.stripePaymentIntentId,'pi_fixture');assert.equal(saved.stripeCancellation.intentStatus,'canceled');assert.equal(calls.filter(c=>c[0]==='POST').length,2);assert.ok(!calls.some(c=>c[1].endsWith('/capture')));
});
test('lost expiry or intent-cancel response is recovered only by verified provider GET',async()=>{
 for(const lost of ['expire','cancel']){const o=await fixture();let closed=lost==='cancel',cancelled=false;const fetchImpl=async(url,options)=>{
  if(options.method==='POST'){if(url.endsWith('/expire'))closed=true;else cancelled=true;throw Error('response lost');}
  return url.includes('/checkout/sessions/')?response(session(o,{status:closed?(lost==='cancel'?'complete':'expired'):'open',payment_intent:lost==='cancel'?'pi_fixture':null})):response(intent(o,{status:cancelled?'canceled':'requires_capture'}));
 };await cancelCheckout(o.id,{env,fetchImpl});assert.equal((await readCheckout(o.id)).status,'cancelled');}
});
test('failed expiry or processing intent never reports a cancelled order; retry reconciles without a second successful expiry',async()=>{
 for(const problem of ['open','processing']){const o=await fixture();let posts=0;
  const fetchImpl=async(url,options)=>{if(options.method==='POST'){posts++;return response({error:'failure'},false);}return url.includes('/checkout/sessions/')?response(session(o,{status:problem==='open'?'open':'complete',payment_intent:problem==='processing'?'pi_fixture':null})):response(intent(o,{status:'processing'}));};
  await assert.rejects(cancelCheckout(o.id,{env,fetchImpl}),/afstem|Annulleringen/i);let saved=await readCheckout(o.id);assert.equal(saved.status,'needs_attention');assert.equal(saved.stripeCancellation.status,'uncertain');assert.equal(posts,problem==='open'?1:0);
  await cancelCheckout(o.id,{env,fetchImpl:async(url,options)=>{assert.equal(options.method,'GET');return url.includes('/checkout/sessions/')?response(session(o,{status:problem==='open'?'expired':'complete',payment_intent:problem==='processing'?'pi_fixture':null})):response(intent(o,{status:'canceled'}));}});saved=await readCheckout(o.id);assert.equal(saved.status,'cancelled');
 }
});
test('captured payment discovered during cancellation preserves evidence and requires reconciliation without refund or capture',async()=>{
 const o=await fixture(),calls=[];await assert.rejects(cancelCheckout(o.id,{env,fetchImpl:async(url,options)=>{calls.push(options.method);return url.includes('/checkout/sessions/')?response(session(o,{status:'complete',payment_intent:'pi_fixture'})):response(intent(o,{status:'succeeded',amount_received:10000,amount_capturable:0}));}}),/hævet/);
 const saved=await readCheckout(o.id);assert.equal(saved.status,'needs_attention');assert.deepEqual(saved.paymentTotals,{captured:10000,refunded:0});assert.ok(saved.paidAt);assert.equal(saved.stripePaymentIntentId,'pi_fixture');assert.deepEqual(calls,['GET','GET']);await assert.rejects(cancelCheckout(o.id,{env,fetchImpl:async()=>{throw Error('unexpected network');}}),/afstemning/);
});
test('mismatched session or intent identity, mode, amount and currency cannot close the local order',async()=>{
 for(const target of ['session','intent'])for(const field of ['id','livemode','amount','currency']){
  const o=await fixture(),changes=field==='id'?{id:'wrong'}:field==='livemode'?{livemode:true}:field==='amount'?{[target==='session'?'amount_total':'amount']:1}:{currency:'eur'};let posts=0;
  await assert.rejects(cancelCheckout(o.id,{env,fetchImpl:async(url,options)=>{if(options.method==='POST')posts++;return url.includes('/checkout/sessions/')?response(session(o,{status:'complete',payment_intent:'pi_fixture',...(target==='session'?changes:{})})):response(intent(o,changes));}}),/matcher/);assert.equal(posts,0);assert.equal((await readCheckout(o.id)).status,'needs_attention');
 }
});
test('late authorization and captured event on a cancelled order remain needs_attention, never production-ready',async()=>{
 const o=await fixture();await cancelCheckout(o.id,{env,fetchImpl:async()=>response(session(o,{status:'expired'}))});
 const authorized=event(o,'payment_intent.amount_capturable_updated',intent(o));await applyStripeEvent(authorized);let saved=await readCheckout(o.id);assert.equal(saved.status,'needs_attention');assert.equal(saved.stripeCancellation.activity.eventId,authorized.id);
 const paid=event(o,'payment_intent.succeeded',intent(o,{status:'succeeded',amount_received:10000}));await applyStripeEvent(paid);saved=await readCheckout(o.id);assert.equal(saved.status,'needs_attention');assert.equal(saved.paymentTotals.captured,10000);assert.ok(saved.paidAt);const count=saved.events.length;
 await applyStripeEvent(paid);await applyStripeEvent(event(o,'payment_intent.canceled',intent(o,{status:'canceled'})));assert.equal((await readCheckout(o.id)).status,'needs_attention');assert.equal((await readCheckout(o.id)).events.length,count+1);
 await assert.rejects(captureCheckout(o.id,{env,fetchImpl:async()=>{throw Error('unexpected network');}}),/aktiv betalingsreservation/);
});
test('legacy local cancellation is repaired by session expiry and legacy late activity is flagged',async()=>{
 const o=await fixture();await updateCheckout(o.id,current=>{current.status='cancelled';current.events.push({type:'cancelled',at:new Date().toISOString()});return current;});let closed=false;
 await cancelCheckout(o.id,{env,fetchImpl:async(url,options)=>{if(options.method==='POST')closed=true;return response(session(o,{status:closed?'expired':'open'}));}});assert.equal(closed,true);
 const other=await fixture();await updateCheckout(other.id,current=>{current.status='cancelled';return current;});await applyStripeEvent(event(other,'checkout.session.completed',session(other,{status:'complete',payment_intent:'pi_fixture'})));assert.equal((await readCheckout(other.id)).status,'needs_attention');
});
test('provider closure followed by local save failure stays uncertain and retry only reconciles',async()=>{
 process.env.SMERCH_DATABASE_ENABLED='1';try{const o=await fixture();let closed=false,posts=0;
  db().exec("CREATE TRIGGER fail_cancelled BEFORE UPDATE ON records WHEN NEW.namespace='checkouts' AND json_extract(NEW.payload,'$.status')='cancelled' BEGIN SELECT RAISE(ABORT,'synthetic persist failure'); END");
  const fetchImpl=async(url,options)=>{if(options.method==='POST'){closed=true;posts++;}return response(session(o,{status:closed?'expired':'open'}));};
  await assert.rejects(cancelCheckout(o.id,{env,fetchImpl}),/synthetic persist/);assert.equal((await readCheckout(o.id)).status,'needs_attention');db().exec('DROP TRIGGER fail_cancelled');await cancelCheckout(o.id,{env,fetchImpl});assert.equal(posts,1);assert.equal((await readCheckout(o.id)).status,'cancelled');
 }finally{closeDatabases();process.env.SMERCH_DATABASE_ENABLED='0';}
});


test('known previous Stripe session and intent activity after cancellation is retained without replacing current attempt identity or totals',async()=>{
 const o=await fixture();await updateCheckout(o.id,current=>{current.status='cancelled';current.stripePaymentIntentId='pi_current';current.previousSessionIds=['cs_test_previous'];current.previousPaymentIntentIds=['pi_previous'];current.paymentTotals={captured:0,refunded:0};current.events.push({type:'cancelled',at:new Date().toISOString()});return current;});
 const completed=event(o,'checkout.session.completed',session(o,{id:'cs_test_previous',status:'complete',payment_intent:'pi_previous'}));
 const authorized=event(o,'payment_intent.amount_capturable_updated',intent(o,{id:'pi_previous'}));
 const paid=event(o,'payment_intent.succeeded',intent(o,{id:'pi_previous',status:'succeeded',amount_received:10000}));
 for(const e of [completed,authorized,paid]){await applyStripeEvent(e);const saved=await readCheckout(o.id);assert.equal(saved.status,'needs_attention');assert.equal(saved.stripeSessionId,o.stripeSessionId);assert.equal(saved.stripePaymentIntentId,'pi_current');assert.deepEqual(saved.paymentTotals,{captured:0,refunded:0});assert.equal(saved.paidAt,undefined);}
 let saved=await readCheckout(o.id);assert.equal(saved.stripeCancellation.previousAttempts.length,3);assert.equal(saved.stripeCancellation.previousAttempts.at(-1).amountReceived,10000);const count=saved.events.length;
 await applyStripeEvent(paid);await assert.rejects(applyStripeEvent({...paid,id:'evt_bad_previous',data:{object:{...paid.data.object,amount_received:1}}}),/beløb/);await assert.rejects(applyStripeEvent({...paid,id:'evt_unknown',data:{object:{...paid.data.object,id:'pi_unknown'}}}),/passer ikke/);saved=await readCheckout(o.id);assert.equal(saved.events.length,count);assert.equal(saved.stripeCancellation.previousAttempts.length,3);await assert.rejects(cancelCheckout(o.id,{env,fetchImpl:async()=>{throw Error('must not query or close historical attempts');}}),/tidligere forsøg/);assert.equal((await readCheckout(o.id)).status,'needs_attention');
});
