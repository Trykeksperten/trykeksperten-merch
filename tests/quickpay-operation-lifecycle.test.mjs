import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {persistCheckout,readCheckout,updateCheckout} from '../lib/checkout.mjs';
import {createQuickpayLink,renewQuickpay,applyQuickpayCallback,refreshQuickpayStatus,cancelQuickpay} from '../lib/quickpay.mjs';
import {db,closeDatabases} from '../lib/backoffice/database.mjs';

const root=await mkdtemp('/tmp/smerch-quickpay-lifecycle-'),previous={root:process.env.SMERCH_DATA_DIR,mode:process.env.SMERCH_DATABASE_ENABLED};process.env.SMERCH_DATA_DIR=root;process.env.SMERCH_DATABASE_ENABLED='0';
after(async()=>{closeDatabases();await rm(root,{recursive:true,force:true});for(const [key,value] of [['SMERCH_DATA_DIR',previous.root],['SMERCH_DATABASE_ENABLED',previous.mode]])if(value===undefined)delete process.env[key];else process.env[key]=value;});
const env={PAYMENT_PROVIDER:'quickpay',QUICKPAY_MODE:'test',QUICKPAY_API_KEY:'test',QUICKPAY_PRIVATE_KEY:'test',QUICKPAY_AUTH_HOLD_HOURS:'48',SMERCH_PUBLIC_BASE_URL:'http://localhost:5173'};
const response=(data,ok=true,status=ok?200:409)=>({ok,status,json:async()=>structuredClone(data)});
async function fixture(status='prepared'){const o={id:'pay-'+randomUUID(),paymentProvider:'quickpay',status,createdAt:new Date().toISOString(),totalIncVat:10000,paymentAttempt:0,shipping:{email:'test@example.invalid'},pfOrderIds:[],events:[]};if(status!=='prepared')Object.assign(o,{quickpayPaymentId:123,quickpayOrderId:randomUUID().replaceAll('-','').slice(0,20),quickpayLinkUrl:'https://payment.quickpay.net/payments/original'});await persistCheckout(o);return o;}
const op=(id,type,pending=false,amount=10000)=>({id,type,amount,pending,qp_status_code:pending?'20200':'20000',created_at:new Date().toISOString()});
const payment=(o,operations)=>({id:o.quickpayPaymentId,order_id:o.quickpayOrderId,type:'Payment',currency:'DKK',test_mode:true,accepted:true,link:{amount:o.totalIncVat},operations});

test('pending authorize observed by GET does not consume completion; legacy consumed keys also recover',async()=>{
 for(const legacy of [false,true]){
  const o=await fixture('awaiting_payment'),pending=payment(o,[op(1,'authorize',true)]),done=payment(o,[op(1,'authorize')]);
  if(legacy)await updateCheckout(o.id,current=>{current.events.push({id:'quickpay-123-1',type:'quickpay_pending'});return current;});else await refreshQuickpayStatus(o.id,{env,fetchImpl:async()=>response(pending)});
  assert.equal((await readCheckout(o.id)).status,'awaiting_payment');
  await applyQuickpayCallback(done,{env});const final=await readCheckout(o.id);assert.equal(final.status,'authorized');assert.ok(final.authorizationExpiresAt);
  await applyQuickpayCallback(done,{env});await refreshQuickpayStatus(o.id,{env,fetchImpl:async()=>response(done)});await applyQuickpayCallback(pending,{env});
  const saved=await readCheckout(o.id);assert.equal(saved.status,'authorized');assert.equal(saved.events.length,final.events.length);assert.equal(saved.authorizationExpiresAt,final.authorizationExpiresAt);
 }
});
test('pending capture and refund finish once and delayed snapshots cannot erase settled totals',async()=>{
 const o=await fixture('authorized'),authorized=op(1,'authorize'),capturing=payment(o,[authorized,op(2,'capture',true)]),captured=payment(o,[authorized,op(2,'capture')]);
 await refreshQuickpayStatus(o.id,{env,fetchImpl:async()=>response(capturing)});assert.equal((await readCheckout(o.id)).status,'authorized');
 await applyQuickpayCallback(captured,{env});assert.equal((await readCheckout(o.id)).status,'paid');
 const refunding=payment(o,[authorized,op(2,'capture'),op(3,'refund',true,2500)]),refunded=payment(o,[authorized,op(2,'capture'),op(3,'refund',false,2500)]);
 await refreshQuickpayStatus(o.id,{env,fetchImpl:async()=>response(refunding)});assert.equal((await readCheckout(o.id)).paymentTotals.refunded,0);
 await applyQuickpayCallback(refunded,{env});const final=await readCheckout(o.id);assert.deepEqual(final.paymentTotals,{captured:10000,refunded:2500});
 for(const value of [refunded,refunding,captured,capturing,payment(o,[authorized])])await applyQuickpayCallback(value,{env});
 const saved=await readCheckout(o.id);assert.deepEqual(saved.paymentTotals,final.paymentTotals);assert.equal(saved.events.length,final.events.length);assert.equal(saved.status,'paid');
});
test('pending cancellation can complete and a stale authorization cannot reopen it',async()=>{
 const o=await fixture('authorized'),authorized=op(1,'authorize');await applyQuickpayCallback(payment(o,[authorized,op(2,'cancel',true)]),{env});await applyQuickpayCallback(payment(o,[authorized,op(2,'cancel')]),{env});await applyQuickpayCallback(payment(o,[authorized]),{env});assert.equal((await readCheckout(o.id)).status,'authorization_expired');
});

for(const mode of ['0','1'])test(`simultaneous create sends one POST and one PUT and returns the same durable link (${mode})`,async()=>{
 process.env.SMERCH_DATABASE_ENABLED=mode;try{const o=await fixture(),calls=[];const fetchImpl=async(url,options)=>{calls.push(options.method);if(options.method==='POST')return response({id:456,order_id:JSON.parse(options.body).order_id});return response({url:'https://payment.quickpay.net/payments/created'});};const results=await Promise.all([1,2,3].map(()=>createQuickpayLink(o.id,{env,fetchImpl})));assert.deepEqual(calls,['POST','PUT']);assert.deepEqual(results[0],results[1]);assert.equal((await readCheckout(o.id)).quickpaySetup.phase,'ready');}finally{closeDatabases();process.env.SMERCH_DATABASE_ENABLED='0';}
});
for(const problem of ['timeout','409','invalid response'])test(`uncertain payment creation (${problem}) is claimed durably and cannot POST again`,async()=>{
 const o=await fixture();let posts=0;
 const fetchImpl=async()=>{posts++;if(problem==='timeout')throw Error('lost response');return problem==='409'?response({message:'duplicate'},false):response({id:999,order_id:'wrong'});};
 await assert.rejects(createQuickpayLink(o.id,{env,fetchImpl}),/afstemning/);assert.equal((await readCheckout(o.id)).status,'payment_setup_uncertain');
 await assert.rejects(createQuickpayLink(o.id,{env,fetchImpl}),/afstemning/);await assert.rejects(renewQuickpay(o.id,{env,fetchImpl}),/afstem/i);assert.equal(posts,1);
 // Even an incorrect local status reset cannot erase the durable POST claim.
 await updateCheckout(o.id,current=>{current.status='prepared';current.quickpaySetup=null;return current;});await assert.rejects(createQuickpayLink(o.id,{env,fetchImpl}),/allerede startet/);assert.equal(posts,1);
});
test('provider create success followed by SQLite save failure remains blocked across a retry',async()=>{
 process.env.SMERCH_DATABASE_ENABLED='1';try{
  const o=await fixture();db().exec("CREATE TRIGGER fail_created_payment BEFORE UPDATE ON records WHEN NEW.namespace='checkouts' AND json_extract(NEW.payload,'$.quickpayPaymentId') IS NOT NULL BEGIN SELECT RAISE(ABORT,'synthetic persist failure'); END");let posts=0;
  const fetchImpl=async(url,options)=>{posts++;return response({id:567,order_id:JSON.parse(options.body).order_id});};
  await assert.rejects(createQuickpayLink(o.id,{env,fetchImpl}),/afstemning/);db().exec('DROP TRIGGER fail_created_payment');assert.equal((await readCheckout(o.id)).status,'payment_setup_uncertain');await assert.rejects(createQuickpayLink(o.id,{env,fetchImpl}),/afstemning/);assert.equal(posts,1);
 }finally{closeDatabases();process.env.SMERCH_DATABASE_ENABLED='0';}
});
test('unfinished setup or renewal cannot be cancelled by another worker before its request settles',async()=>{
 for(const phase of ['create_requested','created','link_requested','uncertain']){const o=await fixture('awaiting_payment');await updateCheckout(o.id,current=>{current.quickpaySetup={phase};return current;});await assert.rejects(cancelQuickpay(o.id,{env,fetchImpl:async()=>{throw Error('unexpected external request');}}),/afstemning/);assert.equal((await readCheckout(o.id)).status,'awaiting_payment');}
 const o=await fixture('authorization_expired');await updateCheckout(o.id,current=>{current.quickpayRenewal={status:'requested'};return current;});await assert.rejects(cancelQuickpay(o.id,{env,fetchImpl:async()=>{throw Error('unexpected external request');}}),/afstemning/);
});

test('lost link response preserves the known payment and blocks duplicate PUT or new payment',async()=>{
 const o=await fixture();let posts=0,puts=0;const fetchImpl=async(url,options)=>{if(options.method==='POST'){posts++;return response({id:678,order_id:JSON.parse(options.body).order_id});}puts++;throw Error('lost link response');};
 await assert.rejects(createQuickpayLink(o.id,{env,fetchImpl}),/afstemning/);const saved=await readCheckout(o.id);assert.equal(saved.quickpayPaymentId,678);assert.equal(saved.quickpaySetup.phase,'uncertain');await assert.rejects(createQuickpayLink(o.id,{env,fetchImpl}),/afstemning/);assert.equal(posts,1);assert.equal(puts,1);
});
test('a callback received during link PUT keeps its authorization and cannot be overwritten by setup',async()=>{
 const o=await fixture();await createQuickpayLink(o.id,{env,fetchImpl:async(url,options)=>{if(options.method==='POST')return response({id:789,order_id:JSON.parse(options.body).order_id});const current=await readCheckout(o.id);await applyQuickpayCallback(payment(current,[op(1,'authorize')]),{env});return response({url:'https://payment.quickpay.net/payments/callback'});}});assert.equal((await readCheckout(o.id)).status,'authorized');
});
test('failed authorization received during link PUT stays failed and can reuse the same payment link',async()=>{
 const o=await fixture();let creates=0;await createQuickpayLink(o.id,{env,fetchImpl:async(url,options)=>{if(options.method==='POST'){creates++;return response({id:790,order_id:JSON.parse(options.body).order_id});}const current=await readCheckout(o.id);await applyQuickpayCallback(payment(current,[{...op(1,'authorize'),qp_status_code:'40000'}]),{env});return response({url:'https://payment.quickpay.net/payments/failed'});}});assert.equal((await readCheckout(o.id)).status,'payment_failed');
 const saved=await readCheckout(o.id),result=await renewQuickpay(o.id,{env,fetchImpl:async(url,options)=>{assert.equal(options.method,'GET');return response(payment(saved,[{...op(1,'authorize'),qp_status_code:'40000'}]));}});assert.equal(result.paymentId,790);assert.equal(creates,1);assert.equal((await readCheckout(o.id)).status,'awaiting_payment');
});

test('two renewals cancel the old authorization once and create only one replacement',async()=>{
 const o=await fixture('authorization_expired');let cancelled=false,creates=0,cancels=0,puts=0;const fetchImpl=async(url,options)=>{
  if(options.method==='GET')return response(payment(o,[op(1,'authorize'),...(cancelled?[op(2,'cancel')]:[])]));
  if(url.includes('/cancel?')){cancels++;cancelled=true;return response(payment(o,[op(1,'authorize'),op(2,'cancel')]));}
  if(options.method==='POST'){creates++;return response({id:890,order_id:JSON.parse(options.body).order_id});}puts++;return response({url:'https://payment.quickpay.net/payments/renewed'});
 };const results=await Promise.all([1,2].map(()=>renewQuickpay(o.id,{env,fetchImpl})));assert.deepEqual(results[0],results[1]);assert.equal(creates,1);assert.equal(cancels,1);assert.equal(puts,1);const saved=await readCheckout(o.id);assert.equal(saved.paymentAttempt,1);assert.deepEqual(saved.previousQuickpayPaymentIds,[123]);
});
test('renewal cancellation timeout and late payment during verification never create a replacement',async()=>{
 for(const race of ['timeout','paid']){const o=await fixture('authorization_expired');let cancels=0,creates=0,reads=0;
  const fetchImpl=async(url,options)=>{if(options.method==='GET'){if(++reads===2&&race==='paid')await applyQuickpayCallback(payment(o,[op(1,'authorize'),op(2,'capture')]),{env});return response(payment(o,[op(1,'authorize'),...(reads===2?[op(2,'cancel')]:[])]));}if(url.includes('/cancel?')){cancels++;if(race==='timeout')throw Error('lost response');return response({});}creates++;throw Error('must not create');};
  await assert.rejects(renewQuickpay(o.id,{env,fetchImpl}),/afstemning/);await assert.rejects(renewQuickpay(o.id,{env,fetchImpl}),/afstem/i);assert.equal(creates,0);assert.equal(cancels,1);assert.equal((await readCheckout(o.id)).status,race==='paid'?'paid':'payment_setup_uncertain');
 }
});
test('an old payment_setup without a known provider id is never blindly resumed',async()=>{
 const o=await fixture();await updateCheckout(o.id,current=>{current.status='payment_setup';return current;});await assert.rejects(createQuickpayLink(o.id,{env,fetchImpl:async()=>{throw Error('unexpected external request');}}),/afstemning/);
});

test('independent Node processes cannot claim the same payment-create attempt twice',async()=>{
 const o=await fixture(),release=root+'/release-'+randomUUID(),log=root+'/posts-'+randomUUID(),module=new URL('../lib/quickpay.mjs',import.meta.url).href;
 const script=`import {createQuickpayLink} from ${JSON.stringify(module)};import {appendFile,access} from 'node:fs/promises';import {setTimeout as delay} from 'node:timers/promises';globalThis.fetch=()=>{throw Error('external network prohibited');};for(let i=0;;i++){try{await access(${JSON.stringify(release)});break;}catch{}if(i>200)throw Error('barrier timeout');await delay(10);}try{await createQuickpayLink(${JSON.stringify(o.id)},{env:${JSON.stringify(env)},fetchImpl:async(url,options)=>{if(options.method==='POST'){await appendFile(${JSON.stringify(log)},'POST\\n');await delay(30);return {ok:true,json:async()=>({id:901,order_id:JSON.parse(options.body).order_id})};}return {ok:true,json:async()=>({url:'https://payment.quickpay.net/payments/process'})};}});process.stdout.write('ok');}catch(error){process.stdout.write('blocked');}`;
 function run(){const child=spawn(process.execPath,['--input-type=module','-e',script],{env:{PATH:process.env.PATH,SMERCH_DATA_DIR:root,SMERCH_DATABASE_ENABLED:'0'},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);return new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve(stdout):reject(Error(stderr)));});}
 const a=run(),b=run();await writeFile(release,'go');const results=await Promise.all([a,b]);assert.ok(results.includes('ok'));assert.equal((await readFile(log,'utf8')).trim().split('\n').length,1);assert.equal((await readCheckout(o.id)).status,'awaiting_payment');
});
