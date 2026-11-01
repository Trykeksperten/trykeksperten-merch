import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {persistCheckout,readCheckout,updateCheckout} from '../lib/checkout.mjs';
import {applyQuickpayCallback} from '../lib/quickpay.mjs';
import {reconcileSalesPayment,executeSalesPayment} from '../lib/sales-payments.mjs';
import {saveVerifiedPayment,readLedger,withLedger,ledgerOrder} from '../lib/sales-ledger.mjs';
import {proofPaymentSettled} from '../dist/proof-payment-policy.mjs';
import {closeDatabases} from '../lib/backoffice/database.mjs';
const prior={root:process.env.SMERCH_DATA_DIR,mode:process.env.SMERCH_DATABASE_ENABLED},root=await mkdtemp(join(tmpdir(),'finance-callback-acceptance-'));
process.env.SMERCH_DATA_DIR=root;process.env.SMERCH_DATABASE_ENABLED='0';
after(async()=>{closeDatabases();await rm(root,{recursive:true,force:true});for(const [key,value] of [['SMERCH_DATA_DIR',prior.root],['SMERCH_DATABASE_ENABLED',prior.mode]])if(value===undefined)delete process.env[key];else process.env[key]=value;});
const env={QUICKPAY_MODE:'live',QUICKPAY_API_KEY:'fixture'},response=payment=>({ok:true,status:200,json:async()=>structuredClone(payment)});
const op=(id,type,amount)=>({id,type,amount,pending:false,qp_status_code:'20000',created_at:'2026-01-02T00:00:00Z'});
async function fixture(){const order={id:'pay-'+randomUUID(),paymentProvider:'quickpay',paymentMode:'live',status:'authorized',quickpayPaymentId:123,quickpayOrderId:randomUUID(),totalIncVat:10000,authorizationExpiresAt:new Date(Date.now()+3600000).toISOString(),createdAt:'2026-01-01',lines:[{sku:'DEMO',quantity:1}],shipping:{email:'demo@example.test'},events:[]};await persistCheckout(order);const payment={id:123,order_id:order.quickpayOrderId,type:'Payment',currency:'DKK',test_mode:false,accepted:true,link:{amount:10000},operations:[op(1,'authorize',10000)]};return {order,payment};}
async function callback(order,payment){await applyQuickpayCallback(payment,{env});await saveVerifiedPayment(order,payment);}
test('older finance GET cannot downgrade a completed capture recorded by callback',async()=>{
 const {order,payment}=await fixture(),older={...payment,operations:[...payment.operations,op(2,'capture',5000)]},newer={...payment,operations:[...older.operations,op(3,'capture',5000)]};
 const ledger=await reconcileSalesPayment(order.id,{env,fetchImpl:async()=>{await callback(order,newer);return response(older);}});
 const saved=await readCheckout(order.id);assert.equal(saved.status,'paid');assert.deepEqual(saved.paymentTotals,{captured:10000,refunded:0});
 assert.deepEqual(ledger.payments.map(p=>[p.id,p.type,p.amount]),[[2,'capture',5000],[3,'capture',5000]]);
});
test('older finance GET cannot erase a refund and reopen the proof-payment gate',async()=>{
 const {order,payment}=await fixture(),older={...payment,operations:[...payment.operations,op(2,'capture',10000)]},newer={...payment,operations:[...older.operations,op(3,'refund',10000)]};
 const ledger=await reconcileSalesPayment(order.id,{env,fetchImpl:async()=>{await callback(order,newer);assert.equal(proofPaymentSettled(await readCheckout(order.id)),false);return response(older);}});
 const saved=await readCheckout(order.id);assert.deepEqual(saved.paymentTotals,{captured:10000,refunded:10000});assert.equal(proofPaymentSettled(saved),false);
 assert.deepEqual(ledger.payments.map(p=>[p.id,p.type,p.amount]),[[2,'capture',10000],[3,'refund',10000]]);
});
test('finance GET for a superseded payment cannot update the replacement payment',async()=>{
 const {order,payment}=await fixture(),captured={...payment,operations:[...payment.operations,op(2,'capture',10000)]};
 await assert.rejects(reconcileSalesPayment(order.id,{env,fetchImpl:async()=>{await updateCheckout(order.id,current=>{current.quickpayPaymentId=456;current.quickpayOrderId='replacement';current.status='awaiting_payment';return current;});return response(captured);}}),/ændret|matcher|afstem/i);
 const saved=await readCheckout(order.id);assert.equal(saved.status,'awaiting_payment');assert.equal(saved.paymentTotals,undefined);
 assert.equal(saved.quickpayPaymentId,456);assert.equal(saved.quickpayOrderId,'replacement');assert.equal((await readLedger()).orders[order.id],undefined);
});

for(const changed of ['cancelled','replacement'])test(`finance capture rereads ${changed} checkout after provider GET before any POST`,async()=>{
 const {order,payment}=await fixture(),pfId='ord-'+randomUUID(),proof={version:1,hash:'fixture'},staff={type:'staff',name:'Reviewer'};
 await updateCheckout(order.id,current=>{current.legal={customerType:'consumer',prepayment:true,prepaymentText:'Accepted prepayment',acceptedAt:'2026-01-01'};current.shipping.country='DK';current.pfOrderIds=[pfId];current.fulfillment={groups:[{lineIndexes:[0]}]};return current;});
 await mkdir(join(root,'orders'),{recursive:true});await writeFile(join(root,'orders',pfId+'.json'),JSON.stringify({id:pfId,checkoutId:order.id,pfOrderNumber:123,status:'approval_pending_pf',proof,proofs:[proof],lines:order.lines,decision:{decision:'approve',actor:'customer',version:1,proofHash:proof.hash,staffApproval:{version:1,proofHash:proof.hash,performedBy:staff}},events:[]}));
 let posts=0,gets=0;const captured={...payment,operations:[...payment.operations,op(2,'capture',10000)]};
 await assert.rejects(executeSalesPayment(order.id,{kind:'capture',amount:10000,key:'capture-after-get:'+order.id},{env:{...env,SMERCH_FINANCE_ENABLED:'1',SMERCH_PAYMENT_AGREEMENT_CONFIRMED:'1',QUICKPAY_CAPTURE_ENABLED:'1'},fetchImpl:async(url,options)=>{
  if(options.method==='POST'){posts++;return response(captured);}
  if(++gets===1){await updateCheckout(order.id,current=>{if(changed==='cancelled')current.status='cancelled';else{current.quickpayPaymentId=456;current.quickpayOrderId='replacement';}return current;});return response(payment);}
  return response(captured);
 }}),/status|ændret|matcher|afstem/i);assert.equal(posts,0);
 assert.equal((await readLedger()).orders[order.id].operations.length,0);
});

test('finance POST outcome cannot erase a newer refund callback',async()=>{
 const {order,payment}=await fixture(),captured={...payment,operations:[...payment.operations,op(2,'capture',10000)]},older={...payment,operations:[...captured.operations,op(3,'refund',2500)]},newer={...payment,operations:[...older.operations,op(4,'refund',7500)]},creditId=randomUUID();
 await callback(order,captured);await withLedger(data=>{ledgerOrder(data,order.id).documents.push({id:creditId,kind:'credit',total:10000});});
 let gets=0,posts=0;const result=await executeSalesPayment(order.id,{kind:'refund',amount:2500,documentId:creditId,key:'refund-race:'+order.id},{env:{...env,SMERCH_FINANCE_ENABLED:'1',SMERCH_PAYMENT_AGREEMENT_CONFIRMED:'1',QUICKPAY_REFUND_ENABLED:'1'},fetchImpl:async(url,options)=>{
  if(options.method==='POST'){posts++;await applyQuickpayCallback(newer,{env});return response(older);}
  return response(++gets===1?captured:older);
 }});
 assert.equal(posts,1);assert.equal(result.status,'confirmed');const saved=await readCheckout(order.id);assert.deepEqual(saved.paymentTotals,{captured:10000,refunded:10000});assert.equal(proofPaymentSettled(saved),false);
 const ledger=(await readLedger()).orders[order.id];assert.equal(ledger.operations.length,1);assert.equal(ledger.operations[0].providerOperationId,3);assert.equal(ledger.payments.filter(p=>p.type==='refund').reduce((sum,p)=>sum+p.amount,0),2500);
 // The later callback's ledger append can finish after this operation releases
 // the ledger lock; neither source totals nor verified history may roll back.
 await saveVerifiedPayment(order,newer);assert.equal((await readLedger()).orders[order.id].payments.filter(p=>p.type==='refund').reduce((sum,p)=>sum+p.amount,0),10000);
});

test('SQLite finance reconciliation preserves newer refunded evidence and ledger history',async()=>{
 process.env.SMERCH_DATABASE_ENABLED='1';try{
  const {order,payment}=await fixture(),older={...payment,operations:[...payment.operations,op(2,'capture',10000)]},newer={...payment,operations:[...older.operations,op(3,'refund',10000)]};
  const ledger=await reconcileSalesPayment(order.id,{env,fetchImpl:async()=>{await callback(order,newer);return response(older);}}),saved=await readCheckout(order.id);
  assert.deepEqual(saved.paymentTotals,{captured:10000,refunded:10000});assert.equal(proofPaymentSettled(saved),false);assert.deepEqual(ledger.payments.map(p=>[p.type,p.amount]),[['capture',10000],['refund',10000]]);
 }finally{closeDatabases();process.env.SMERCH_DATABASE_ENABLED='0';}
});

test('a newer refund callback during finance GET blocks a POST based on stale refundable balance',async()=>{
 const {order,payment}=await fixture(),older={...payment,operations:[...payment.operations,op(2,'capture',10000)]},newer={...payment,operations:[...older.operations,op(3,'refund',7500)]},creditId=randomUUID();
 await callback(order,older);await withLedger(data=>{ledgerOrder(data,order.id).documents.push({id:creditId,kind:'credit',total:10000});});let posts=0;
 await assert.rejects(executeSalesPayment(order.id,{kind:'refund',amount:5000,documentId:creditId,key:'stale-refund:'+order.id},{env:{...env,SMERCH_FINANCE_ENABLED:'1',SMERCH_PAYMENT_AGREEMENT_CONFIRMED:'1',QUICKPAY_REFUND_ENABLED:'1'},fetchImpl:async(url,options)=>{
  if(options.method==='POST'){posts++;return response(older);}await applyQuickpayCallback(newer,{env});return response(older);
 }}),/afstem|nyere|ændret/i);
 assert.equal(posts,0);assert.deepEqual((await readCheckout(order.id)).paymentTotals,{captured:10000,refunded:7500});assert.equal((await readLedger()).orders[order.id].operations.length,0);
});
