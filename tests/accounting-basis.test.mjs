import test from 'node:test';
import assert from 'node:assert/strict';
import {accountingPayment} from '../lib/accounting-payment.mjs';
import {refundBasis,queueRefundBasis} from '../lib/refund-basis.mjs';
import {documentSeed,reviewDocument} from '../lib/order-documents.mjs';
import {renderBrandedDocument} from '../lib/invoice-basis-pdf.mjs';
import {PDFDocument} from 'pdf-lib';
const order={id:'pay-demo',createdAt:'2026-10-28',paymentProvider:'quickpay',quickpayOrderId:'MATCH123',quickpayPaymentId:123,status:'authorized',totalIncVat:12500,freightExVat:0,quote:{net:10000,lines:[{net:10000}]},lines:[{sku:'CAP',productId:'cap',quantity:10}],productNames:{cap:'Kasket'},legal:{customerType:'consumer',prepayment:true},shipping:{name:'Testkunde',email:'test@example.test',street:'Testvej 1',postalCode:'2300',city:'København',country:'DK'}};
const finance={payments:[{type:'capture',key:'123:2',id:2,paymentId:123,amount:12500,at:'2026-10-28T10:00:00Z'},{type:'refund',key:'123:3',id:3,paymentId:123,amount:2500,at:'2026-10-28T11:00:00Z'}],documents:[],operations:[]};
const input={paymentKey:'123:3',items:[{index:0,quantity:2,net:2000}],freight:0,vat:500,reason:'To varer returneret'};
const company={name:'Smerch',legalName:'Test ApS',address:'Testvej 2',cvr:'12345678',email:'hello@example.test',phone:'12345678',paymentTerms:'Kortbetaling'};
test('reservation or status alone never establishes captured payment',()=>{
 assert.equal(accountingPayment(order).paymentStatus,'Afventer forudbetaling – produktion må ikke startes');
 assert.doesNotMatch(accountingPayment({...order,status:'paid',paidAt:'2026-10-28'}).paymentStatus,/^Betalt/);
 assert.equal(accountingPayment({...order,paymentTotals:{captured:12500}}).paymentStatus,'Betalt – beløbet er hævet');
 assert.match(accountingPayment({...order,paymentTotals:{captured:5000}}).paymentStatus,/Delvist/);
 assert.match(accountingPayment(order,finance.payments).paymentStatus,/refunderet/);
});
test('ordinary consumer invoice basis includes immutable reconciliation references and delivery address fallback',()=>{
 const seed=documentSeed({id:'ord-demo'},order,company,'basis');assert.equal(seed.accountingReference,'MATCH123');assert.match(seed.customer.address,/Testvej 1/);
 const checked=reviewDocument({id:'ord-demo'},order,company,{...seed,paymentStatus:'Betalt',accountingReference:'WRONG'});
 assert.equal(checked.accountingReference,'MATCH123');assert.match(checked.paymentStatus,/Afventer forudbetaling/);
});
test('refund basis is linked to confirmed operation, preserves lines and never requests another refund',async()=>{
 const d=refundBasis(order,finance,input);assert.equal(d.total,2500);assert.equal(d.accountingReference,'MATCH123');assert.equal(d.lines[0].quantity,2);assert.match(d.notes,/123\/3/);assert.match(d.paymentTerms,/Ingen ny/);
 assert.ok((await PDFDocument.load(await renderBrandedDocument(d))).getPageCount()>0);
});
test('refund basis rejects unknown payment, mismatched amount, duplicate lines and test orders',()=>{
 assert.throws(()=>refundBasis(order,finance,{...input,paymentKey:'123:2'}),/verificeret/);
 assert.throws(()=>refundBasis(order,finance,{...input,vat:501}),/præcist/);
 assert.throws(()=>refundBasis(order,finance,{...input,items:[...input.items,...input.items]}),/Ugyldigt/);
 assert.throws(()=>refundBasis({...order,adminTest:true},finance,input),/Testordrer/);
});
test('refund PDF queues once and sends the reviewed attachment once, with no payment calls',async()=>{
 const {mkdtemp,rm,writeFile,mkdir}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{randomUUID}=await import('node:crypto');
 const {persistCheckout}=await import('../lib/checkout.mjs'),{withLedger,readLedger}=await import('../lib/sales-ledger.mjs'),{sendFinanceMail}=await import('../lib/sales-mail.mjs');
 const before=process.env.SMERCH_DATA_DIR,root=await mkdtemp(join(tmpdir(),'refund-basis-'));process.env.SMERCH_DATA_DIR=root;
 try{
  const o={...order,id:'pay-'+randomUUID()};await persistCheckout(o);await withLedger(data=>{data.orders[o.id]={...structuredClone(finance),mail:[],problems:[],shipments:[],events:[]};});
  const a=await queueRefundBasis(o.id,input),b=await queueRefundBasis(o.id,input);assert.equal(a.key,b.key);
  await assert.rejects(queueRefundBasis(o.id,{...input,reason:'changed'}),/allerede/);
  let sends=0;const transport={sendMail:async m=>{sends++;assert.match(m.subject,/refunderingsgrundlag/);assert.equal(m.attachments[0].filename,'Smerch-refunderingsgrundlag.pdf');return {accepted:[m.to]};}};
  await sendFinanceMail(o.id,a.key,{transport});await sendFinanceMail(o.id,a.key,{transport});assert.equal(sends,1);
  const saved=(await readLedger()).orders[o.id];assert.equal(saved.mail.length,1);assert.deepEqual(saved.payments,finance.payments);
  if(process.env.SMERCH_ACCOUNTING_PREVIEW_DIR){const dir=process.env.SMERCH_ACCOUNTING_PREVIEW_DIR;await mkdir(dir,{recursive:true});await writeFile(join(dir,'refund-demo.pdf'),Buffer.from(saved.mail[0].pdf,'base64'));const seed=documentSeed({id:'ord-demo'},o,company,'basis');const reviewed=reviewDocument({id:'ord-demo'},o,company,seed);await writeFile(join(dir,'basis-unpaid-demo.pdf'),await renderBrandedDocument(reviewed));}
 }finally{if(before===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=before;await rm(root,{recursive:true,force:true});}
});
