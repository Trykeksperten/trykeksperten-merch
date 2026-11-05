import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {accountingDay,buildAccountingReport} from '../lib/accounting/report.mjs';

const order=(id,overrides={})=>({id,paymentProvider:'quickpay',paymentMode:'live',...overrides});
const allocation={reference:'clear-7',bankReference:'bank-10',payoutDate:'2025-11-03',economicReference:'bilag-8',gross:12500,refunds:0,fees:250,adjustments:100,held:0,bank:12350};
const capture={type:'capture',paymentId:411,id:512,reference:'qp-order-1',amount:12500,at:'2025-10-31T23:30:00Z',testMode:false};
const receipt={kind:'payment_receipt',key:'receipt:411:512',paymentId:411,operationId:512,paidAt:capture.at,status:'sent',to:'private@example.test',text:'Synthetic receipt body'};

test('monthly export keeps sales, payments and payouts separate across Copenhagen month boundaries',()=>{
 const shipment={key:'ship-1',shipDate:'2025-10-31',net:10000,vat:2500,total:12500};
 const samples=[
  {order:order('order-1',{paidAt:capture.at}),finance:{shipments:[shipment],payments:[capture,capture,{...capture,type:'authorize',id:514}],settlements:[allocation],mail:[receipt]}},
  {order:order('order-2'),finance:{settlements:[{...allocation,gross:25000,fees:350,adjustments:0,bank:24650}]}},
  {order:order('bank-order',{paymentProvider:'bank_transfer',bankPayment:{invoiceNumber:'F-7',receipts:[{amount:2200,reference:'ref-7',at:'2025-11-06T12:00:00+01:00'}]}})},
  {order:order('test-order',{adminLiveTest:true}),finance:{payments:[{...capture,amount:1000000}]}}
 ];
 const october=buildAccountingReport('2025-10',samples);
 assert.equal(october.totals.salesGross,12500);
 assert.equal(october.totals.captured,0);
 assert.equal(october.totals.payouts,0);
 assert.equal(october.rows[0].paymentDate,'2025-11-01');
 const november=buildAccountingReport('2025-11',samples);
 assert.equal(november.totals.salesGross,0);
 assert.equal(november.totals.captured,12500);
 assert.equal(november.totals.bankPayments,2200);
 assert.equal(november.totals.fees,600);
 assert.equal(november.totals.payouts,37000);
 assert.equal(november.payouts.length,1);
 assert.equal(november.payouts[0].allocationIds.length,2);
 const row=november.rows.find(r=>r.kind==='capture'),document=november.rows.find(r=>r.kind==='document');
 assert.equal(row.paymentId,411);
 assert.equal(row.quickpayReference,'qp-order-1');
 assert.deepEqual(row.documentIds,[document.id]);
 assert.equal(document.digest,createHash('sha256').update(receipt.text).digest('hex'));
 assert.ok(!JSON.stringify(november).includes(receipt.to)&&!JSON.stringify(november).includes(receipt.text));
 assert.equal(november.fingerprint,buildAccountingReport('2025-11',samples.toReversed()).fingerprint);
 assert.deepEqual(november.issues,[]);
});

test('corrections affect sales; refunds affect cash; unverified and undated data cannot silently enter totals',()=>{
 const data={order:order('order-1'),finance:{
  documents:[{kind:'invoice',id:'inv-1',date:'2025-11-02',total:12500,vat:2500},
   {kind:'credit',id:'cr-1',original:'inv-1',date:'2025-11-03',total:12500,vat:2500},
   {kind:'replacement',id:'re-1',original:'inv-1',date:'2025-11-04',total:12500,vat:2500,correctionPosting:true},
   {kind:'replacement',id:'re-2',original:'inv-2',date:'2025-11-05',total:12500,vat:2500,correctionPosting:false}],
  payments:[capture,{...capture,type:'refund',id:613,amount:2000},{...capture,id:614,amount:1000,testMode:true},{...capture,id:615,at:null,verifiedAt:'2025-11-12'}],
  settlements:[{...allocation,payoutDate:undefined}]
 }};
 const other={order:order('old-order',{paymentMode:undefined}),finance:{payments:[{...capture,testMode:undefined}]}};
 const report=buildAccountingReport('2025-11',[data,other]);
 assert.equal(report.totals.salesNet,0);
 assert.equal(report.totals.refunded,2000);
 assert.equal(report.totals.captured,12500);
 assert.equal(report.totals.payouts,0);
 assert.equal(report.unassignedSettlements.length,1);
 assert.deepEqual(report.issues.map(i=>[i.code,i.blocking]),[['payment_mode_unverified',true],['payment_date_missing',true],['settlement_date_missing',false]]);
 assert.equal(accountingDay('2025-02-30'),null);
 assert.equal(accountingDay('2025-11-01T03:00:00'),null);
});

test('conflicting replay of a payment is visible and never increases totals',()=>{
 const r=buildAccountingReport('2025-11',[{order:order('order-1'),finance:{payments:[capture,{...capture,amount:99999}]}}]);
 assert.equal(r.totals.captured,12500);
 assert.deepEqual(r.issues,[{orderId:'order-1',code:'conflicting_source',blocking:true}]);
});

test('custom date ranges include both dates across months and keep transaction IDs shared with monthly reports',()=>{
 const source={order:order('order-1'),finance:{
  shipments:[{key:'shipment-before',shipDate:'2025-10-31',net:1000,vat:250,total:1250}],
  payments:[capture,{...capture,id:513,amount:500,at:'2025-12-01T22:59:59Z'},{...capture,id:514,amount:250,at:'2025-12-01T23:00:00Z'}],
  settlements:[allocation],mail:[receipt]
 }};
 const from='2025-11-01',to='2025-12-01';
 const range=buildAccountingReport({from,to},[source]);
 const monthly=buildAccountingReport('2025-11',[source]);
 assert.equal(range.from,from);
 assert.equal(range.to,to);
 assert.equal(range.period,undefined);
 assert.equal(range.totals.captured,13000);
 assert.equal(range.totals.salesGross,0);
 assert.equal(range.totals.payouts,12350);
 assert.equal(range.rows.find(r=>r.operationId===512&&r.kind==='capture').id,monthly.rows.find(r=>r.kind==='capture').id);
 assert.equal(buildAccountingReport({from,to:from},[source]).totals.captured,12500);
 assert.throws(()=>buildAccountingReport({from:to,to:from},[]),{status:400});
 assert.throws(()=>buildAccountingReport({from:'2025-02-30',to},[]),{status:400});
});
