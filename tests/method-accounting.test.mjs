import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomUUID} from 'node:crypto';
import {initializeMethodAccounting,queueMethodAccountantMail} from '../lib/method-accounting.mjs';
import {persistCheckout,readCheckout,updateCheckout} from '../lib/checkout.mjs';
import {financeConfiguration,readLedger,withLedger,ledgerOrder,saveVerifiedPayment} from '../lib/sales-ledger.mjs';
import {sendFinanceMail,queueAccountantBasis} from '../lib/sales-mail.mjs';
import {processSalesFinance} from '../lib/sales-worker.mjs';
import {prepareBankPayment,applyBankPayment,publicBankPayment} from '../lib/bank-payment.mjs';
import {bankPaymentComplete} from '../lib/production-payment.mjs';
let root;beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'smerch-method-accounting-'));process.env.SMERCH_DATA_DIR=root;});afterEach(()=>rm(root,{recursive:true,force:true}));
const actor={type:'staff',name:'Synthetic reviewer'};
const env={SMERCH_FINANCE_ENABLED:'1',SMERCH_FINANCE_START_AT:'2020-01-01T00:00:00Z',SMERCH_AUTOMATIC_SHIPMENT_CAPTURE:'0',SMERCH_PAYMENT_RECEIPT_MAIL:'review',SMERCH_ACCOUNTANT_MAIL:'automatic',SMERCH_ACCOUNTANT_EMAIL:'bookkeeper@example.invalid'};
const forbidden=async()=>{throw Error('No payment or supplier calls permitted');};
async function fixture(method='quickpay',{legacy=false,testOrder=false}={}){
 const o={id:'pay-'+randomUUID(),createdAt:new Date().toISOString(),paymentProvider:method,paymentMode:'live',status:'authorized',adminTest:testOrder,totalIncVat:12500,freightExVat:0,freightIncVat:0,quickpayPaymentId:123,quickpayOrderId:randomUUID().slice(0,20),shipping:{name:'Synthetic Customer',email:'customer@example.invalid',street:'Test 1',postalCode:'2300',city:'Test',country:'DK'},billing:{},legal:{customerType:'consumer',deliveryTerms:'Synthetic delivery terms'},lines:[{productId:'pf-synthetic',sku:'SYN',quantity:2,decorations:[]}],quote:{net:10000,vat:2500,lines:[{net:10000,vat:2500,totalIncVat:12500}]},pfOrderIds:[],events:[]};
 if(method==='bank_transfer')prepareBankPayment(o);if(!legacy)initializeMethodAccounting(o);await persistCheckout(o);return o;
}
async function capture(order,{pending=false,testMode=false}={}){
 const payment={id:123,order_id:order.quickpayOrderId,test_mode:testMode,operations:[{id:1,type:'authorize',amount:12500,pending:false,qp_status_code:'20000',created_at:new Date().toISOString()},{id:2,type:'capture',amount:12500,pending,qp_status_code:'20000',created_at:new Date().toISOString()}]};
 if(!pending)await updateCheckout(order.id,o=>{o.status='paid';o.paidAt=new Date().toISOString();return o;});await saveVerifiedPayment(await readCheckout(order.id),payment);return payment;
}
const mailer=(sent,fail=false)=>({sendMail:async message=>{sent.push(message);if(fail)throw Error('Synthetic SMTP timeout');return {accepted:[message.to]};}});
const rows=async id=>(await readLedger()).orders[id]?.mail||[];
test('bank invoice request is automatic before payment/dispatch, goes only to accountant and sends once',async()=>{
 const o=await fixture('bank_transfer'),sent=[];await processSalesFinance({env,fetchImpl:forbidden,transport:mailer(sent)});await processSalesFinance({env,fetchImpl:forbidden,transport:mailer(sent)});
 assert.equal(sent.length,1);assert.equal(sent[0].to,'bookkeeper@example.invalid');assert.match(sent[0].text,/Kunden har valgt fakturabetaling/);assert.match(sent[0].text,/Send fakturaen til kunden på customer@example.invalid/);assert.match(sent[0].text,/kopi til Smerch/);assert.equal(sent[0].attachments.length,1);assert.match(sent[0].attachments[0].content,/Internt grundlag – ikke en faktura/);assert.match(sent[0].attachments[0].content,/125,00/);assert.equal(sent[0].disableFileAccess,true);assert.equal(sent[0].disableUrlAccess,true);
 const saved=await readCheckout(o.id);assert.equal(saved.status,'awaiting_bank_payment');assert.equal(saved.paidAt,undefined);assert.deepEqual(saved.pfOrderIds,[]);assert.equal(saved.bankPayment.invoiceNumber,null);assert.deepEqual(saved.bankPayment.receipts,[]);assert.equal((await rows(o.id))[0].kind,'accountant_invoice_request');
});
test('Quickpay authorization and pending capture never create an accountant receipt or invoice request',async()=>{
 const o=await fixture(),sent=[];await processSalesFinance({env,fetchImpl:forbidden,transport:mailer(sent)});await capture(o,{pending:true});await processSalesFinance({env,fetchImpl:forbidden,transport:mailer(sent)});assert.equal(sent.length,0);assert.equal((await rows(o.id)).filter(r=>r.kind.startsWith('accountant_')).length,0);
});
for(const mode of ['review',undefined])test('new accounting mail requires explicit automatic approval: '+mode,async()=>{
 const o=await fixture('bank_transfer'),sent=[];await processSalesFinance({env:{...env,SMERCH_ACCOUNTANT_MAIL:mode},fetchImpl:forbidden,transport:mailer(sent)});assert.equal(sent.length,0);assert.equal((await rows(o.id)).length,0);
});
test('test checkouts, test payment evidence and unverified captures cannot send accounting mail',async()=>{
 const sent=[];const o=await fixture();await capture(o,{testMode:true});await processSalesFinance({env,fetchImpl:forbidden,transport:mailer(sent)});assert.equal(sent.length,0);
 await withLedger(data=>{ledgerOrder(data,o.id).payments=[];});await capture(o);await withLedger(data=>{delete ledgerOrder(data,o.id).payments.find(p=>p.type==='capture').verifiedAt;});assert.deepEqual(await queueMethodAccountantMail(o.id,{finance:financeConfiguration(env)}),[]);
 const other=await fixture();await updateCheckout(other.id,v=>({...v,adminLiveTest:true}));await capture(other);await processSalesFinance({env,fetchImpl:forbidden,transport:mailer(sent)});assert.equal(sent.length,0);
});
test('invoice SMTP uncertainty is durable, automatic retries stop and staff retry uses the same message id',async()=>{
 const o=await fixture('bank_transfer'),sent=[];
 await processSalesFinance({env,fetchImpl:forbidden,transport:mailer(sent,true)});
 const row=(await rows(o.id)).find(r=>r.kind==='accountant_invoice_request');
 assert.equal(row.status,'uncertain');const originalId=sent[0].messageId;
 await processSalesFinance({env,fetchImpl:forbidden,transport:mailer(sent)});
 assert.equal(sent.length,1);
 await assert.rejects(sendFinanceMail(o.id,row.key,{env,automatic:true,transport:mailer(sent)}),/mailkontoen/);
 await sendFinanceMail(o.id,row.key,{env,confirmedNotSent:true,transport:mailer(sent)});
 assert.equal(sent.length,2);assert.equal(sent[1].messageId,originalId);
 await sendFinanceMail(o.id,row.key,{env,transport:mailer(sent)});assert.equal(sent.length,2);
});
test('invoice changes or modified attachment cannot send stale material',async()=>{
 const o=await fixture('bank_transfer'),sent=[];const [row]=await queueMethodAccountantMail(o.id,{finance:financeConfiguration(env)});await updateCheckout(o.id,v=>({...v,shipping:{...v.shipping,name:'Changed'}}));await assert.rejects(sendFinanceMail(o.id,row.key,{env,transport:mailer(sent)}),/grundlaget er ændret/);assert.equal(sent.length,0);
 const h=await fixture('bank_transfer');const [other]=await queueMethodAccountantMail(h.id,{finance:financeConfiguration(env)});await withLedger(d=>{d.orders[h.id].mail.find(m=>m.key===other.key).basisHTML+='tampered';});await assert.rejects(sendFinanceMail(h.id,other.key,{env,transport:mailer(sent)}),/grundlaget er ændret/);assert.equal(sent.length,0);
});
test('manual invoice-sent acknowledgement changes no money, creates no mail and is idempotent; invoice number alone is separate',async()=>{
 const o=await fixture('bank_transfer'),before=structuredClone(o);applyBankPayment(o,{action:'invoice',invoiceNumber:'EXTERNAL-1'},{actor});assert.equal(o.bankPayment.invoicedAt,undefined);assert.equal(o.bankPayment.invoiceNumber,'EXTERNAL-1');
 for(const bad of [{confirmed:false,actor},{confirmed:true,actor:{type:'customer',name:'Customer'}}])assert.throws(()=>applyBankPayment(o,{action:'invoice_sent',confirmed:bad.confirmed},{actor:bad.actor}));
 applyBankPayment(o,{action:'invoice_sent',confirmed:true},{actor,now:1000});applyBankPayment(o,{action:'invoice_sent',confirmed:true},{actor,now:2000});assert.equal(o.bankPayment.invoicedAt,'1970-01-01T00:00:01.000Z');assert.equal(o.bankPayment.invoiceSender,'Financial Outsourcing');assert.deepEqual(o.bankPayment.invoiceSentConfirmedBy,actor);assert.equal(o.events.filter(e=>e.type==='bank_invoice_sent').length,1);assert.equal(o.status,before.status);assert.equal(o.paidAt,undefined);assert.deepEqual(o.bankPayment.receipts,[]);assert.equal(bankPaymentComplete(o),false);assert.equal(publicBankPayment(o).invoiceSender,'Financial Outsourcing');assert.equal((await rows(o.id)).length,0);
 assert.throws(()=>applyBankPayment({...o,paymentProvider:'quickpay'},{action:'invoice_sent',confirmed:true},{actor}),/bankbetaling/);
});
test('registered/sent invoices and cancelled orders do not trigger another invoice request',async()=>{
 const o=await fixture('bank_transfer');const [row]=await queueMethodAccountantMail(o.id,{finance:financeConfiguration(env)});await updateCheckout(o.id,v=>applyBankPayment(v,{action:'invoice_sent',confirmed:true},{actor}));const sent=[];await processSalesFinance({env,fetchImpl:forbidden,transport:mailer(sent)});assert.equal(sent.length,0);assert.equal((await rows(o.id)).find(m=>m.key===row.key).status,'obsolete');
 const h=await fixture('bank_transfer');await updateCheckout(h.id,v=>applyBankPayment(v,{action:'invoice',invoiceNumber:'EXTERNAL-2'},{actor}));await processSalesFinance({env,fetchImpl:forbidden,transport:mailer(sent)});assert.equal(sent.length,0);assert.equal((await rows(h.id)).length,0);
 const c=await fixture('bank_transfer');await updateCheckout(c.id,v=>({...v,status:'cancelled'}));await processSalesFinance({env,fetchImpl:forbidden,transport:mailer(sent)});assert.equal(sent.length,0);
});
test('legacy bank orders and historic review recipients/text remain untouched',async()=>{
 const o=await fixture('bank_transfer',{legacy:true}),q=await fixture('quickpay',{legacy:true});await capture(q);await withLedger(d=>{const f=d.orders[q.id];f.mail.push({key:'legacy-review',kind:'accountant_basis',requiresReview:true,status:'review',to:'original-accountant@example.invalid',text:'Historical instructions'});});const old=structuredClone(await rows(q.id)),savedBank=await readFile(join(root,'checkouts',o.id+'.json'),'utf8'),sent=[];
 await processSalesFinance({env,fetchImpl:forbidden,transport:mailer(sent)});assert.equal(sent.length,0);assert.deepEqual(await rows(q.id),old);assert.equal(await readFile(join(root,'checkouts',o.id+'.json'),'utf8'),savedBank);assert.equal((await rows(o.id)).length,0);
});
test('new Quickpay cannot request invoice PDFs, legacy draft sync or customer invoice resend',async()=>{
 const {documentEligibility}=await import('../lib/order-documents.mjs'),{resendOptions,prepareResend}=await import('../lib/order-resend.mjs'),{syncEconomicInvoice}=await import('../lib/economic-invoices.mjs');const o=await fixture();await capture(o);const current=await readCheckout(o.id);current.invoice={status:'booked',bookedInvoiceNumber:123};const pf={id:'ord-'+randomUUID(),status:'shipped'};
 assert.match(documentEligibility(pf,current,'basis'),/ikke fakturagrundlag/);const options=await resendOptions(pf,current);assert.equal(options.find(x=>x.action==='invoice').available,false);await assert.rejects(prepareResend(pf,current,'invoice',{fetchImpl:forbidden}),/bogholderen/);
 const economic={ECONOMIC_ENABLED:'1',ECONOMIC_APP_SECRET_TOKEN:'synthetic',ECONOMIC_AGREEMENT_GRANT_TOKEN:'synthetic',ECONOMIC_CUSTOMER_GROUP_NUMBER:'1',ECONOMIC_PAYMENT_TERMS_NUMBER:'1',ECONOMIC_LAYOUT_NUMBER:'1',ECONOMIC_VAT_ZONE_NUMBER:'1',ECONOMIC_PRODUCT_NUMBER:'SYN',ECONOMIC_FREIGHT_PRODUCT_NUMBER:'SYN'};await assert.rejects(syncEconomicInvoice(o.id,{env:economic,fetchImpl:forbidden}),/Kun bekræftede/);
});
test('invoice requests reject invalid amount/customer evidence before creating a message',async()=>{
 const o=await fixture('bank_transfer');await updateCheckout(o.id,v=>({...v,totalIncVat:NaN}));await assert.rejects(queueMethodAccountantMail(o.id,{finance:financeConfiguration(env)}),/beløb skal afstemmes/);assert.equal((await rows(o.id)).length,0);
});
test('new invoice and Quickpay workflows preserve their separate messages and confirmations in SQLite',async()=>{
 const {closeDatabases}=await import('../lib/backoffice/database.mjs');process.env.SMERCH_DATABASE_ENABLED='1';
 const automaticEnv={...env,SMERCH_PAYMENT_RECEIPT_MAIL:'automatic'};
 try{const bank=await fixture('bank_transfer'),card=await fixture();await capture(card);const sent=[];await processSalesFinance({env:automaticEnv,fetchImpl:forbidden,transport:mailer(sent)});await processSalesFinance({env:automaticEnv,fetchImpl:forbidden,transport:mailer(sent)});assert.equal(sent.length,2);assert.equal(sent.filter(m=>m.attachments.length).length,1);assert.equal((await rows(bank.id))[0].kind,'accountant_invoice_request');assert.deepEqual((await rows(card.id)).map(m=>[m.kind,m.status]),[['payment_receipt','sent']]);await updateCheckout(bank.id,v=>applyBankPayment(v,{action:'invoice_sent',confirmed:true},{actor}));const b=await readCheckout(bank.id);assert.equal(b.bankPayment.invoiceSender,'Financial Outsourcing');assert.equal(b.status,'awaiting_bank_payment');assert.deepEqual(b.bankPayment.receipts,[]);}finally{closeDatabases();delete process.env.SMERCH_DATABASE_ENABLED;}
});

test('a changed accountant recipient blocks automatic delivery and keeps the problem visible',async()=>{
 const order=await fixture('bank_transfer');
 const [draft]=await queueMethodAccountantMail(order.id,{finance:financeConfiguration(env)});
 const sent=[];
 const options={env:{...env,SMERCH_ACCOUNTANT_EMAIL:'changed@example.invalid'},fetchImpl:forbidden,transport:mailer(sent)};
 await processSalesFinance(options);
 await processSalesFinance(options);
 assert.deepEqual(sent,[]);
 const row=(await rows(order.id)).find(mail=>mail.key===draft.key);
 assert.equal(row.status,'blocked');
 assert.match(row.error,/Bogholdermodtageren er ændret/);
});

for(const fail of [false,true]){
 test(`only the customer receives a verified Quickpay receipt, including replay and SMTP failure (${fail})`,async()=>{
  const order=await fixture(),attempts=[];
  const options={env:{...env,SMERCH_PAYMENT_RECEIPT_MAIL:'automatic'},fetchImpl:forbidden,transport:mailer(attempts,fail)};
  await capture(order,{pending:true});
  await processSalesFinance(options);
  assert.equal(attempts.length,0);
  const payment=await capture(order);
  await saveVerifiedPayment(await readCheckout(order.id),payment);
  await Promise.all([processSalesFinance(options),processSalesFinance(options)]);
  await processSalesFinance(options);
  assert.deepEqual(attempts.map(mail=>mail.to),[order.shipping.email]);
  const [customer]=attempts;
  assert.match(customer.text,/Ordre nr:/);
  assert.match(customer.text,/125,00 DKK/);
  assert.match(customer.text,/Betalingsdato:/);
  assert.ok(customer.text.includes(order.quickpayOrderId));
  assert.deepEqual((await rows(order.id)).map(row=>[row.kind,row.status]),[['payment_receipt',fail?'uncertain':'sent']]);
 });
}

test('retired Quickpay accountant drafts cannot send or create tasks and sent records are preserved',async()=>{
 const {financeView}=await import('../lib/sales-ledger.mjs');
 const order=await fixture('quickpay',{legacy:true}),sent=[];
 await capture(order);
 await withLedger(data=>{
  const {mail}=ledgerOrder(data,order.id);
  mail.push({kind:'accountant_payment_receipt',key:'retired',status:'uncertain',error:'Old SMTP error'});
  mail.push({kind:'accountant_basis',key:'retired-basis',status:'review',requiresReview:true});
  mail.push({kind:'accountant_payment_receipt',key:'history',status:'sent'});
 });
 const options={env:{...env,SMERCH_PAYMENT_RECEIPT_MAIL:'automatic'},fetchImpl:forbidden,transport:mailer(sent)};
 await assert.rejects(sendFinanceMail(order.id,'retired',{...options,confirmedNotSent:true}),/månedsrapporten/);
 await assert.rejects(sendFinanceMail(order.id,'retired-basis',options),/fakturabetaling/);
 await processSalesFinance(options);
 assert.deepEqual(sent.map(mail=>mail.to),[order.shipping.email]);
 const view=await financeView(order.id);
 assert.equal(view.accountingPurpose,'reconciliation');
 assert.deepEqual(view.mail.map(mail=>mail.kind),['payment_receipt','accountant_payment_receipt']);
 assert.ok(!view.summary.problems.some(problem=>/Old SMTP error|manuel gennemgang/.test(problem)));
 assert.equal((await rows(order.id)).length,4);
});
