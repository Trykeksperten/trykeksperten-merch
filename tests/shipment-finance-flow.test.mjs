import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {persistCheckout,readCheckout,updateCheckout} from '../lib/checkout.mjs';
import {applyPFNotification,readOrder} from '../lib/pf-orders.mjs';
import {reconcileShipmentMail,shipmentMailStatus,sendShipmentMail,processShipmentMail} from '../lib/shipment-mail.mjs';
import {reconcileSalesShipments,financeView,saveVerifiedPayment,withLedger,updateFinance} from '../lib/sales-ledger.mjs';
import {executeSalesPayment} from '../lib/sales-payments.mjs';
import {captureApprovedCheckout} from '../lib/order-flow.mjs';
import {queueAccountantBasis,sendFinanceMail} from '../lib/sales-mail.mjs';
import {salesBasis} from '../lib/sales-basis.mjs';
import {processSalesFinance} from '../lib/sales-worker.mjs';
import {saveAutomationSettings} from '../lib/automation-settings.mjs';
import {initializeMethodAccounting} from '../lib/method-accounting.mjs';
import {applyQuickpayPayment} from '../lib/quickpay.mjs';
const prior=process.env.SMERCH_DATA_DIR,root=await mkdtemp(join(tmpdir(),'smerch-pipeline-'));process.env.SMERCH_DATA_DIR=root;
after(async()=>{if(prior===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=prior;await rm(root,{recursive:true,force:true});});
const env={SMERCH_FINANCE_ENABLED:'1',SMERCH_PAYMENT_AGREEMENT_CONFIRMED:'1',QUICKPAY_MODE:'live',QUICKPAY_API_KEY:'mock-only',QUICKPAY_CAPTURE_ENABLED:'1'};
const operation=(id,type,amount)=>({id,type,amount,pending:false,qp_status_code:'20000',created_at:new Date(Date.now()-3600000).toISOString()});
async function fixture(){
 const id='pay-'+randomUUID(),pfId='ord-'+randomUUID(),date=new Date(Date.now()-3600000).toISOString();
 const order={id,paymentProvider:'quickpay',status:'authorized',createdAt:date,quickpayPaymentId:123,quickpayOrderId:randomUUID().slice(0,20),lines:[{productId:'demo',productName:'Demokasket med broderi',sku:'DEMO-CAP',quantity:4,decorations:[{method:'Broderi fixed',position:'Forside'}]}],quote:{net:10000,lines:[{net:10000}]},freightExVat:1000,totalIncVat:13750,legal:{customerType:'business'},billing:{company:'Demokunde ApS',street:'Eksempelvej 1',postalCode:'2300',city:'København S',country:'DK',email:'kunde@example.test',cvr:'12345678',reference:'Demo-reference'},shipping:{name:'Demokunde',company:'Demokunde ApS',street:'Eksempelvej 1',postalCode:'2300',city:'København S',country:'DK',email:'kunde@example.test'},pfOrderIds:[pfId],fulfillment:{groups:[{lineIndexes:[0],kind:'printed'}]},authorizationExpiresAt:new Date(Date.now()+86400000).toISOString(),events:[]};
 await persistCheckout(order);const pf={id:pfId,checkoutId:id,checkoutGroupIndex:0,purchaseOrderNumber:'SMERCH-'+pfId.slice(4),pfOrderNumber:'DEMO-ONLY',status:'processing',createdAt:date,shipping:order.shipping,lines:order.lines,proof:{approvalReference:'DEMO-APPROVED'},events:[]};await mkdir(join(root,'orders'),{recursive:true});await writeFile(join(root,'orders',pfId+'.json'),JSON.stringify(pf));
 const payment={id:123,order_id:order.quickpayOrderId,type:'Payment',currency:'DKK',acquirer:'clearhaus',test_mode:false,accepted:true,link:{amount:13750},operations:[operation(1,'authorize',13750)]};let posts=0;
 const fetchImpl=async(url,options)=>{if(options.method==='POST'){posts++;assert.match(url,/capture$/);const amount=JSON.parse(options.body).amount;payment.operations.push(operation(2,'capture',amount));}return {ok:true,status:200,json:async()=>structuredClone(payment)};};
 return {order,pf,payment,fetchImpl,posts:()=>posts};
}
function notice(pf,{quantity=4,complete=true,tracking=true,reference=true,shipDate=new Date(Date.now()-600000).toISOString(),messageId=randomUUID()}={}){return {ShipmentNotification:{messageId,deliveries:[{deliveryLocation:{customerPONumber:pf.purchaseOrderNumber,carrier:'UPS',shipDate,isOrderComplete:complete,trackAndTrace:tracking?[{trackingId:'DEMO123',trackingURL:'https://tracking.example.test/DEMO123'}]:[],item:[{SKU:'DEMO-CAP',quantity}],...(reference?{reference:{shipmentID:'DEMO-SHIPMENT'}}:{})}}]}};}
async function delivered(f,options={}){const message=notice(f.pf,options);const pf=await applyPFNotification('shipment',message);await reconcileShipmentMail(pf);await reconcileSalesShipments(f.order.id);return {pf,message};}
const accepted={sendMail:async mail=>({accepted:[mail.to]})};
test('PF shipment to one full capture, tracking mail and customer receipt is idempotent end to end',async()=>{
 const f=await fixture();const {message}=await delivered(f);await applyPFNotification('shipment',message);await applyPFNotification('shipment',{ShipmentNotification:{...message.ShipmentNotification,messageId:randomUUID()}});await reconcileSalesShipments(f.order.id);await reconcileShipmentMail(await readOrder(f.pf.id));
 let view=await financeView(f.order.id);assert.equal(view.shipments.length,1);assert.equal(view.mail.length,0);assert.equal(view.summary.captured,0);assert.equal((await shipmentMailStatus(f.pf.id)).length,1);
 const input={kind:'capture',amount:13750,key:'capture:full-order-demo'};assert.equal((await executeSalesPayment(f.order.id,input,{env,fetchImpl:f.fetchImpl})).status,'confirmed');await executeSalesPayment(f.order.id,input,{env,fetchImpl:f.fetchImpl});assert.equal(f.posts(),1);
 view=await financeView(f.order.id);assert.equal(view.summary.netPaid,13750);assert.equal((await readCheckout(f.order.id)).status,'paid');const receipt=view.mail.find(m=>m.kind==='payment_receipt');const mails=[];const transport={sendMail:async m=>{mails.push(m);return {accepted:[m.to]};}};
 await sendFinanceMail(f.order.id,receipt.key,{transport});await sendFinanceMail(f.order.id,receipt.key,{transport});const shipping=(await shipmentMailStatus(f.pf.id))[0];await sendShipmentMail(f.pf.id,shipping.id,{transport});await sendShipmentMail(f.pf.id,shipping.id,{transport});
 assert.equal(mails.length,2);assert.ok(mails.every(m=>m.to===f.order.shipping.email));assert.match(mails.find(m=>m.subject==='Smerch – betalingskvittering').text,/137,50/);assert.match(mails.find(m=>m.subject.includes('afsendt')).text,/https:\/\/tracking.example.test\/DEMO123/);
 if(process.env.SMERCH_PIPELINE_PREVIEW_DIR){const out=process.env.SMERCH_PIPELINE_PREVIEW_DIR;await mkdir(out,{recursive:true});await writeFile(join(out,'betalingskvittering-demo.txt'),mails.find(m=>m.subject==='Smerch – betalingskvittering').text);await writeFile(join(out,'forsendelsesmail-demo.txt'),mails.find(m=>m.subject.includes('afsendt')).text);}
});
test('missing tracking blocks only tracking mail and a later reference enriches the same delivery without duplicate quantities',async()=>{
 const f=await fixture(),date=new Date(Date.now()-600000).toISOString();await delivered(f,{tracking:false,reference:false,shipDate:date});assert.equal((await shipmentMailStatus(f.pf.id))[0].status,'blocked');
 await applyPFNotification('shipment',notice(f.pf,{shipDate:date}));const updated=await applyPFNotification('shipment',notice(f.pf,{shipDate:date}));await reconcileShipmentMail(updated);await reconcileSalesShipments(f.order.id);assert.equal(updated.shipment.deliveries.length,1);assert.equal((await financeView(f.order.id)).shipments.length,1);assert.deepEqual((await financeView(f.order.id)).problems,[]);assert.equal((await shipmentMailStatus(f.pf.id)).length,1);assert.equal((await shipmentMailStatus(f.pf.id))[0].status,'review');
});
test('tracking alone, future shipment dates, contradictory quantities and incomplete shipments never capture',async()=>{
 for(const options of [{quantity:2},{complete:false},{shipDate:'2099-01-01'}]){const f=await fixture();await delivered(f,options);await assert.rejects(executeSalesPayment(f.order.id,{kind:'capture',amount:13750,key:'capture:blocked-demo'},{env,fetchImpl:f.fetchImpl}));assert.equal(f.posts(),0);}
 const f=await fixture(),message=notice(f.pf);delete message.ShipmentNotification.deliveries[0].deliveryLocation.item;await applyPFNotification('shipment',message);await reconcileSalesShipments(f.order.id);await assert.rejects(executeSalesPayment(f.order.id,{kind:'capture',amount:13750,key:'capture:tracking-only'},{env,fetchImpl:f.fetchImpl}));assert.equal(f.posts(),0);
});
for(const flow of ['legacy','finance'])test(`${flow} capture requires actual shipment quantities and accepts a corrected full ASN`,async()=>{
 const f=await fixture(),missing=notice(f.pf);delete missing.ShipmentNotification.deliveries[0].deliveryLocation.item;await applyPFNotification('shipment',missing);
 const capture=()=>flow==='legacy'?captureApprovedCheckout(f.order.id,{env,fetchImpl:f.fetchImpl}):executeSalesPayment(f.order.id,{kind:'capture',amount:f.order.totalIncVat,key:'capture:actual-quantities'},{env,fetchImpl:f.fetchImpl});
 await assert.rejects(capture());assert.equal(f.posts(),0);assert.equal((await readCheckout(f.order.id)).status,'authorized');
 await applyPFNotification('shipment',notice(f.pf));const result=await capture();assert.equal(result.status,flow==='legacy'?'paid':'confirmed');assert.equal(f.posts(),1);assert.equal((await readCheckout(f.order.id)).status,'paid');
});
test('changing billing after queued or sent basis retains previous PDF and requires review of a new version',async()=>{
 const f=await fixture();await updateCheckout(f.order.id,order=>({...order,paymentProvider:'bank_transfer'}));await delivered(f);let view=await financeView(f.order.id);const key=view.shipments[0].key,first=await queueAccountantBasis(f.order.id,key);
 await updateFinance(f.order.id,{action:'billing',billing:{...f.order.billing,company:'Rettet Demokunde ApS'}});await assert.rejects(sendFinanceMail(f.order.id,first.key,{transport:accepted}),/ændret/);
 const second=await queueAccountantBasis(f.order.id,key);assert.notEqual(second.key,first.key);await sendFinanceMail(f.order.id,second.key,{transport:accepted});
 await updateFinance(f.order.id,{action:'billing',billing:{...f.order.billing,company:'Ny fakturamodtager ApS'}});const third=await queueAccountantBasis(f.order.id,key);assert.equal(third.requiresReview,true);assert.notEqual(third.pdf,second.pdf);const data=JSON.parse(await readFile(join(root,'sales-ledger.json'),'utf8'));assert.equal(data.orders[f.order.id].mail.find(m=>m.key===second.key).pdf,second.pdf);assert.ok((await financeView(f.order.id)).summary.problems.some(p=>p.includes('manuel gennemgang')));
});
test('unacknowledged SMTP stays uncertain, is visible and never retries without explicit reconciliation',async()=>{
 const f=await fixture();await delivered(f);await executeSalesPayment(f.order.id,{kind:'capture',amount:13750,key:'capture:mail-test'},{env,fetchImpl:f.fetchImpl});const receipt=(await financeView(f.order.id)).mail[0];let calls=0;const transport={sendMail:async()=>{calls++;return {};}};assert.equal((await sendFinanceMail(f.order.id,receipt.key,{transport})).status,'uncertain');await assert.rejects(sendFinanceMail(f.order.id,receipt.key,{transport}),/mailkontoen/);assert.equal(calls,1);assert.ok((await financeView(f.order.id)).summary.problems.some(p=>p.includes('Betalingskvittering')));
});
test('persistent shipment mail lock prevents a second process from sending',async()=>{
 const f=await fixture();await delivered(f);const row=(await shipmentMailStatus(f.pf.id))[0],lock=join(root,'shipment-mail',row.id+'.lock');await mkdir(lock);try{await assert.rejects(sendShipmentMail(f.pf.id,row.id,{transport:{sendMail:()=>{throw Error('must not send');}}}),/afstemning/);}finally{await rm(lock,{recursive:true});}
 assert.equal((await sendShipmentMail(f.pf.id,row.id,{transport:accepted})).status,'sent');
});
test('explicitly disabled shipment automation leaves eligible orders unchanged',async()=>{
 const before=await readFile(join(root,'sales-ledger.json'),'utf8');await processSalesFinance({env:{...env,SMERCH_FINANCE_START_AT:'2020-01-01',SMERCH_AUTOMATIC_SHIPMENT_CAPTURE:'0',SMERCH_ACCOUNTANT_MAIL:'review',SMERCH_PAYMENT_RECEIPT_MAIL:'review'}});assert.equal(await readFile(join(root,'sales-ledger.json'),'utf8'),before);
});
test('shipment mail uses checkout product names even when PF line only has SKU',async()=>{
 const f=await fixture();f.pf.lines[0].productName=undefined;await writeFile(join(root,'orders',f.pf.id+'.json'),JSON.stringify(f.pf));await updateCheckout(f.order.id,o=>{o.productNames={demo:'Grafton kasket'};return o;});
 await delivered(f);const row=(await shipmentMailStatus(f.pf.id))[0];assert.match(row.text,/4 × Grafton kasket/);
});

test('worker captures a completed shipment and automatically sends one customer receipt',async()=>{
 const f=await fixture(),start=new Date().toISOString();await updateCheckout(f.order.id,o=>({...o,createdAt:start}));
 const mails=[];const options={env:{...env,SMERCH_FINANCE_START_AT:start},fetchImpl:f.fetchImpl,transport:{sendMail:async mail=>{mails.push(mail);return {accepted:[mail.to]};}}};
 await processSalesFinance(options);assert.equal(f.posts(),0);assert.equal(mails.length,0);
 await delivered(f);await processSalesFinance(options);await processSalesFinance(options);
 assert.equal(f.posts(),1);assert.equal((await readCheckout(f.order.id)).status,'paid');
 assert.equal((await financeView(f.order.id)).mail.find(m=>m.kind==='payment_receipt').status,'sent');assert.deepEqual(mails.map(m=>m.to),[f.order.shipping.email]);assert.equal((await financeView(f.order.id)).mail.some(m=>m.kind==='accountant_basis'),false);
});

test('receipt worker sends an existing captured payment with capture disabled and never retries uncertain mail',async()=>{
 const f=await fixture(),start=new Date().toISOString();await updateCheckout(f.order.id,o=>({...o,createdAt:start}));await delivered(f);
 await executeSalesPayment(f.order.id,{kind:'capture',amount:13750,key:'capture:existing'},{env,fetchImpl:f.fetchImpl});
 let calls=0;const options={env:{...env,SMERCH_FINANCE_START_AT:start,SMERCH_AUTOMATIC_SHIPMENT_CAPTURE:'0',SMERCH_ACCOUNTANT_MAIL:'review'},transport:{sendMail:async()=>{calls++;return {};}}};
 await processSalesFinance({...options,env:{...options.env,SMERCH_PAYMENT_RECEIPT_MAIL:'review'}});assert.equal(calls,0);
 await processSalesFinance(options);await processSalesFinance(options);
 assert.equal(calls,1);assert.equal(f.posts(),1);assert.equal((await financeView(f.order.id)).mail.find(m=>m.kind==='payment_receipt').status,'uncertain');
});

test('automatic tracking and the customer receipt survive replay and a delayed capture confirmation',async()=>{
 const f=await fixture(),start=new Date().toISOString();
 await updateCheckout(f.order.id,order=>{
  order.createdAt=start;
  order.paymentMode='live';
  initializeMethodAccounting(order);
  return order;
 });
 await saveAutomationSettings({shipmentMail:'automatic',supplierCustomerMail:'disabled'});
 const mails=[];
 const options={
  env:{...env,SMERCH_FINANCE_START_AT:start,SMERCH_ACCOUNTANT_MAIL:'automatic',SMERCH_ACCOUNTANT_EMAIL:'accountant@example.test'},
  fetchImpl:async(url,options)=>{
   const response=await f.fetchImpl(url,options);
   if(options.method==='POST')f.payment.operations.at(-1).pending=true;
   return response;
  },
  transport:{sendMail:async mail=>{mails.push(mail);return {accepted:[mail.to]};}}
 };
 const {message}=await delivered(f);
 const waiting=await financeView(f.order.id,options);
 assert.equal(waiting.summary.captureWaiting,true);
 assert.deepEqual(waiting.summary.problems,[]);
 assert.equal((await financeView(f.order.id,{env:{...options.env,QUICKPAY_CAPTURE_ENABLED:'0'}})).summary.captureWaiting,false);
 // Limit assertions to this shipment; the shared fixture also contains older shipment drafts.
 await processShipmentMail(options);
 const shipping=(await shipmentMailStatus(f.pf.id))[0];
 assert.equal(shipping.status,'sent');
 const tracking=mails.find(mail=>mail.messageId==='<shipment-'+shipping.id+'@smerch.dk>');
 assert.match(tracking.text,/DEMO123\nhttps:\/\/tracking.example.test\/DEMO123/);
 mails.length=0;
 await processSalesFinance(options);
 await processSalesFinance(options);
 assert.equal(f.posts(),1);
 assert.equal(mails.length,0);
 assert.equal((await financeView(f.order.id)).operations[0].status,'uncertain');
 f.payment.operations.at(-1).pending=false;
 for(let replay=0;replay<2;replay++){
  const order=await applyQuickpayPayment(f.order.id,f.payment,options);
  await saveVerifiedPayment(order,f.payment);
  await applyPFNotification('shipment',message);
  await processSalesFinance(options);
  await processShipmentMail(options);
 }
 const finance=await financeView(f.order.id);
 assert.equal(finance.operations[0].status,'confirmed');
 assert.deepEqual(finance.summary.problems,[]);
 assert.equal(f.posts(),1);
 assert.deepEqual(mails.map(mail=>mail.to).sort(),['kunde@example.test']);
 assert.deepEqual(finance.mail.map(({kind,status})=>[kind,status]).sort(),
  [['payment_receipt','sent']]);
});
