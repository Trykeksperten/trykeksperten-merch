import {createHash} from 'node:crypto';

const dayFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Copenhagen',year:'numeric',month:'2-digit',day:'2-digit'});
const hash=value=>createHash('sha256').update(value).digest('hex');
export const accountingRowId=(...parts)=>hash(JSON.stringify(parts));
const cmp=(a,b)=>a<b?-1:a>b?1:0;
export function isAccountingDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const time=new Date(value);
 return Number.isFinite(time.getTime())&&time.toISOString().slice(0,10)===value;
}
export function accountingDay(value){
 if(isAccountingDate(value))return value;
 // Only timestamps with a specified offset are unambiguous.
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)||!isAccountingDate(value.slice(0,10)))return null;
 const date=new Date(value);
 return Number.isFinite(date.getTime())?dayFormat.format(date):null;
}
export function accountingPeriod(value){
 if(typeof value!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value))throw Object.assign(Error('Vælg en gyldig måned.'),{status:400});
 return value;
}
export function accountingScope(selection){
 let metadata,from,to;
 if(typeof selection==='string'||selection===null){
  const period=accountingPeriod(selection);
  const [year,month]=period.split('-').map(Number);
  from=period+'-01';to=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
  metadata={period};
 }else{
  ({from,to}=selection||{});
  if(![from,to].every(value=>isAccountingDate(value)&&value.startsWith('20')))
   throw Object.assign(Error('Angiv en gyldig fra- og til-dato.'),{status:400});
  if(from>to)throw Object.assign(Error('Til-datoen må ikke ligge før fra-datoen.'),{status:400});
  metadata={from,to};
 }
 return {metadata,includes:day=>Boolean(day&&day>=from&&day<=to)};
}
export const currentAccountingPeriod=(now=new Date())=>dayFormat.format(now).slice(0,7);
export const eligibleOrder=order=>order&&!order.adminTest&&!order.adminLiveTest&&!order.isTest&&order.paymentMode!=='test';
const ref=value=>typeof value==='string'&&value.trim()?value:null;
const minor=value=>Number.isSafeInteger(value)&&value>=0;
const vatAmounts=(net,vat,gross)=>[net,vat,gross].every(minor)&&net+vat===gross;
const entries=(f,key)=>Array.isArray(f[key])?f[key]:[];
const documentKinds=new Set(['invoice','credit','replacement']);
const mailKinds=new Set(['payment_receipt','accountant_payment_receipt','accountant_invoice_request','accountant_basis','refund_basis']);

export function accountingDocuments(order,f){
 const rows=[];
 for(const d of entries(f,'documents')){
  if(!documentKinds.has(d.kind)||!ref(d.id)||!d.pdf)continue;
  rows.push({id:accountingRowId('document',order.id,d.id),type:d.kind,reference:ref(d.number),series:ref(d.series),original:ref(d.original),shipmentReference:ref(d.shipmentKey),date:accountingDay(d.date),amounts:vatAmounts(d.total-d.vat,d.vat,d.total)?{net:d.total-d.vat,vat:d.vat,gross:d.total}:null,format:'pdf',digest:hash(Buffer.from(d.pdf,'base64')),value:d.pdf});
 }
 for(const m of entries(f,'mail')){
  if(!mailKinds.has(m.kind)||!ref(m.key))continue;
  const format=m.pdf?'pdf':m.kind==='accountant_invoice_request'&&m.basisHTML?'html':m.text?'txt':null;
  if(!format)continue;
  const value=format==='pdf'?m.pdf:format==='html'?m.basisHTML:m.text;
  rows.push({id:accountingRowId('mail',order.id,m.key),type:m.kind,reference:m.key,paymentId:m.paymentId??null,operationId:m.operationId??null,shipmentReference:ref(m.shipmentKey),date:accountingDay(m.paidAt||m.createdAt),status:m.status,format,digest:hash(format==='pdf'?Buffer.from(value,'base64'):value),value});
 }
 return rows;
}

// All amounts are in minor units. Cash movements never contribute to the sales totals.
export function buildAccountingReport(selection,sources){
 const {metadata,includes:inPeriod}=accountingScope(selection);
 const rows=new Map(),issues=new Map();
 const issue=(orderId,code,blocking=false)=>issues.set(JSON.stringify([orderId,code]),{orderId,code,blocking});
 const add=(row,{undated=false}={})=>{
  if(!inPeriod(row.date)&&!(undated&&row.date===null))return;
  const previous=rows.get(row.id);
  if(previous&&JSON.stringify(previous)!==JSON.stringify(row))issue(row.orderId,'conflicting_source',true);
  else rows.set(row.id,row);
 };
 for(const {order,orderId=order?.id,finance:f={}} of sources){
  if(!order){issue(orderId,'missing_order',true);continue;}
  if(!eligibleOrder(order))continue;
  const supplierOrderNumbers=[...new Set(order.supplierOrderNumbers||[])].sort(cmp);
  const orderInfo={orderId:order.id,orderNumber:supplierOrderNumbers.join(', ')||order.id,supplierOrderNumbers,currency:'DKK'};
  const documents=accountingDocuments(order,f);
  const paymentDate=accountingDay(order.paidAt);
  for(const {value,...doc} of documents)add({...orderInfo,...doc,kind:'document'});
  for(const s of entries(f,'shipments')){
   const date=accountingDay(s.shipDate);
   if(!date&&inPeriod(accountingDay(s.createdAt)))issue(order.id,'invalid_sale_date',true);
   if(!inPeriod(date))continue;
   if(!ref(s.key)||!vatAmounts(s.net,s.vat,s.total)){issue(order.id,'invalid_sale',true);continue;}
   add({...orderInfo,id:accountingRowId('shipment',s.key),kind:'sale',date,paymentDate,sourceReference:s.key,
    amounts:{net:s.net,vat:s.vat,gross:s.total,vatRateBasisPoints:2500},
    documentIds:documents.filter(d=>d.shipmentReference===s.key).map(d=>d.id).sort(),reconciliationStatus:'source_recorded'});
  }
  for(const d of entries(f,'documents')){
   const date=accountingDay(d.date);
   if(!date&&documentKinds.has(d.kind)&&inPeriod(accountingDay(d.registeredAt)))issue(order.id,'invalid_document_date',true);
   if(!inPeriod(date)||!(d.kind==='credit'||d.kind==='replacement'&&d.correctionPosting===true))continue;
   const net=d.total-d.vat;
   if(!ref(d.id)||!ref(d.original)||!vatAmounts(net,d.vat,d.total)){issue(order.id,'invalid_correction',true);continue;}
   const sign=d.kind==='credit'?-1:1;
   add({...orderInfo,id:accountingRowId('correction',d.id),kind:d.kind,date,sourceReference:d.id,
    originalDocumentId:accountingRowId('document',order.id,d.original),
    documentIds:[accountingRowId('document',order.id,d.id)],amounts:{net:sign*net,vat:sign*d.vat,gross:sign*d.total,vatRateBasisPoints:d.vat===0?0:Math.abs(net/4-d.vat)<1?2500:null},
    reconciliationStatus:'source_recorded'});
  }
  for(const p of entries(f,'payments')){
   if(p.testMode===true||!['capture','refund'].includes(p.type))continue;
   const date=accountingDay(p.at);
   if(!date){if(inPeriod(accountingDay(p.verifiedAt)))issue(order.id,'payment_date_missing',true);continue;}
   if(!inPeriod(date))continue;
   if(p.testMode!==false&&order.paymentMode!=='live'){issue(order.id,'payment_mode_unverified',true);continue;}
   if(!Number.isSafeInteger(p.paymentId)||p.paymentId<=0||!Number.isSafeInteger(p.id)||p.id<=0||!minor(p.amount)||p.amount===0||!ref(p.reference)){issue(order.id,'invalid_payment',true);continue;}
   add({...orderInfo,id:accountingRowId('quickpay',p.paymentId,p.id),kind:p.type,date,paymentDate:date,
    paymentId:p.paymentId,operationId:p.id,quickpayReference:p.reference,amounts:{gross:p.type==='refund'?-p.amount:p.amount},
    documentIds:documents.filter(d=>d.paymentId===p.paymentId&&d.operationId===p.id).map(d=>d.id).sort(),reconciliationStatus:'verified_by_provider'});
  }
  if(order.paymentProvider==='bank_transfer')for(const p of order.bankPayment?.receipts||[]){
   const date=accountingDay(p.at);
   if(!inPeriod(date))continue;
   if(!ref(p.reference)||!minor(p.amount)||p.amount===0){issue(order.id,'invalid_payment',true);continue;}
   add({...orderInfo,id:accountingRowId('bank',order.id,p.reference),kind:'bank_payment',date,paymentDate:date,
    bankReference:p.reference,invoiceReference:ref(order.bankPayment.invoiceNumber),amounts:{gross:p.amount},reconciliationStatus:'recorded_from_bank'});
  }
  for(const s of entries(f,'settlements')){
   const date=accountingDay(s.payoutDate);
   if(!inPeriod(date)&&date!==null)continue;
   if(!ref(s.reference)||!ref(s.bankReference)||!['gross','refunds','fees','bank'].every(k=>minor(s[k]))||
    !['adjustments','held'].every(k=>Number.isSafeInteger(s[k]))||s.gross-s.refunds-s.fees+s.adjustments-s.held!==s.bank){
    issue(order.id,'invalid_settlement',true);continue;
   }
   if(!date)issue(order.id,'settlement_date_missing');
   add({...orderInfo,id:accountingRowId('settlement',order.id,s.reference),kind:'settlement',date,payoutDate:date,
    settlementReference:s.reference,bankReference:s.bankReference,bookkeepingReference:ref(s.economicReference),
    amounts:{gross:s.gross,refunds:s.refunds,fees:s.fees,adjustments:s.adjustments,held:s.held,bank:s.bank},
    reconciliationStatus:date?'recorded_allocation':'payout_date_missing'},{undated:true});
  }
 }
 const ordered=[...rows.values()].sort((a,b)=>cmp(a.date||'',b.date||'')||cmp(a.id,b.id));
 const sum=(kinds,key)=>ordered.filter(r=>r.date&&kinds.includes(r.kind)).reduce((n,r)=>{
  const total=n+(r.amounts?.[key]??0);
  if(!Number.isSafeInteger(total))throw Error('Regnskabsbeløb overstiger det sikre talområde.');
  return total;
 },0);
 const sales=['sale','credit','replacement'],settlement=['settlement'];
 const totals={
  salesNet:sum(sales,'net'),salesVAT:sum(sales,'vat'),salesGross:sum(sales,'gross'),
  captured:sum(['capture'],'gross'),refunded:Math.abs(sum(['refund'],'gross')),bankPayments:sum(['bank_payment'],'gross'),
  settledGross:sum(settlement,'gross'),settledRefunds:sum(settlement,'refunds'),fees:sum(settlement,'fees'),
  payouts:sum(settlement,'bank'),adjustments:sum(settlement,'adjustments'),held:sum(settlement,'held')
 };
 const byPayout=new Map();
 for(const row of ordered.filter(r=>r.kind==='settlement'&&r.date)){
  const key=JSON.stringify([row.settlementReference,row.bankReference,row.date]);
  const group=byPayout.get(key)||{settlementReference:row.settlementReference,bankReference:row.bankReference,payoutDate:row.date,allocationIds:[],amounts:{gross:0,refunds:0,fees:0,adjustments:0,held:0,bank:0}};
  group.allocationIds.push(row.id);
  for(const k of Object.keys(group.amounts)){
   group.amounts[k]+=row.amounts[k];
   if(!Number.isSafeInteger(group.amounts[k]))throw Error('Afregningsbeløb overstiger det sikre talområde.');
  }
  byPayout.set(key,group);
 }
 const core={schema:'smerch.accounting.v1',...metadata,timezone:'Europe/Copenhagen',currency:'DKK',amountUnit:'minor',
  salesBasis:'documented_shipments_with_registered_corrections',totals,issues:[...issues.values()].sort((a,b)=>cmp(a.orderId,b.orderId)||cmp(a.code,b.code)),payouts:[...byPayout.values()],unassignedSettlements:ordered.filter(r=>r.date===null),rows:ordered.filter(r=>r.date!==null)};
 return {...core,fingerprint:hash(JSON.stringify(core))};
}
