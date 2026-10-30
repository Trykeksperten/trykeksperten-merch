import {financeAutomationReleased} from './finance-release-policy.mjs';
import {accountantEmail} from './accounting-contact.mjs';
import {PDFDocument} from 'pdf-lib';
import {mkdir,readFile,writeFile,rename,rmdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {dataPath} from './data-path.mjs';
import {readCheckout,updateCheckout} from './checkout.mjs';
import {readOrder} from './pf-orders.mjs';
import {seller,invoicePolicy,allocateShipment,quickpayTotals,financeSummary,validateSettlement} from './sales-finance.mjs';
const stamp=()=>new Date().toISOString();
const empty=()=>({shipments:[],documents:[],payments:[],operations:[],settlements:[],mail:[],events:[],problems:[]});
export function financeConfiguration(env=process.env){return {enabled:env.SMERCH_FINANCE_ENABLED==='1',automationsEnabled:financeAutomationReleased,startAt:env.SMERCH_FINANCE_START_AT||null,numberingAuthority:env.SMERCH_INVOICE_NUMBERING_AUTHORITY||null,series:env.SMERCH_INVOICE_SERIES||null,accountantEmail:accountantEmail(env),agreementConfirmed:env.SMERCH_PAYMENT_AGREEMENT_CONFIRMED==='1',automaticCapture:env.SMERCH_AUTOMATIC_SHIPMENT_CAPTURE!=='0',receiptMail:env.SMERCH_PAYMENT_RECEIPT_MAIL||'automatic',accountantMail:env.SMERCH_ACCOUNTANT_MAIL||'automatic',accountsConfigured:Boolean(env.SMERCH_ACCOUNTING_MAPPING)};}
export async function readLedger(){try{return JSON.parse(await readFile(dataPath('sales-ledger.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {version:1,orders:{}};throw e;}}
// Exclusive cross-process lock. A crash leaves the lock in place for explicit reconciliation,
// rather than guessing that a payment POST or an invoice allocation did not complete.
export async function withLedger(fn){
 await mkdir(dataPath(),{recursive:true,mode:0o700});const lock=dataPath('sales-ledger.lock');
 try{await mkdir(lock,{mode:0o700});}catch(e){if(e.code==='EEXIST')throw Error('Økonomien behandles eller kræver afstemning efter afbrudt behandling. Prøv igen; ved vedvarende fejl skal driften kontrollere låsen.');throw e;}
 try{const data=await readLedger();const persist=async()=>{const temp=dataPath('sales-ledger-'+randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(data),{mode:0o600});await rename(temp,dataPath('sales-ledger.json'));};const result=await fn(data,persist);await persist();return result;}finally{await rmdir(lock);}
}
export function ledgerOrder(data,id){return data.orders[id]??=empty();}
export async function financeView(id){const order=await readCheckout(id),ledger=(await readLedger()).orders[id]||empty();return {orderId:id,captureDeadline:{at:order.authorizationExpiresAt||null,policy:order.captureDeadlinePolicy||null,lateCapture:order.captureDeadlinePolicy==='clearhaus-179-days'&&Date.parse(order.authorizationExpiresAt)-172*86400000<Date.now()},billing:order.billing||{},seller,policy:invoicePolicy({...order,finance:ledger}),configuration:financeConfiguration(),summary:financeSummary(order,ledger),...ledger,mail:ledger.mail.map(({pdf,...m})=>m),documents:ledger.documents.map(({pdf,...d})=>d)};}
export async function reconcileSalesShipments(id){
 const order=await readCheckout(id),supplierOrders=await Promise.all((order.pfOrderIds||[]).map(readOrder));
 return withLedger(async data=>{
  const f=ledgerOrder(data,id);f.problems=[];
  for(const pf of supplierOrders){
   for(const delivery of pf.shipment?.deliveries||[]){
    const key=pf.id+':'+delivery.key;
    const fingerprint=createHash('sha256').update(JSON.stringify({items:delivery.items,date:delivery.shipDate})).digest('hex'),existing=f.shipments.find(s=>s.key===key);if(existing){if(existing.fingerprint!==fingerprint)f.problems.push('PF har ændret vareantal eller dato på en registreret levering. Afstem før videre behandling.');continue;}
    try{
     if(!delivery.key||!Number.isFinite(Date.parse(delivery.shipDate))||Date.parse(delivery.shipDate)>Date.now()||pf.shipment?.issues?.length)throw Error('Afsendelsesdato eller PF-vareantal kræver afstemning.');
     const policy=invoicePolicy({...order,finance:f});if(!policy.domestic)throw Error('Udlandsordre: momsopsætning mangler.');
     const group=order.fulfillment?.groups?.[pf.checkoutGroupIndex];if(!group)throw Error('Leverancen kan ikke knyttes til ordrelinjer.');
     const items=(delivery.items||[]).map(item=>{const indexes=group.lineIndexes.filter(i=>order.lines[i]?.sku===item.sku);if(indexes.length!==1)throw Error('SKU matcher flere eller ingen ordrelinjer. Afstem leverancen.');return {index:indexes[0],quantity:item.quantity};});
     const shipment={key,fingerprint,source:pf.id,shipDate:delivery.shipDate,...allocateShipment(order,f.shipments,items),invoiceStatus:'awaiting_accountant',createdAt:stamp()};
     f.shipments.push(shipment);f.events.push({at:stamp(),type:'shipment_finance_created',key});
    }catch(e){f.problems.push(e.message);}
   }
  }
  return f;
 });
}
export function recordVerifiedPayment(f,order,payment){
 const totals=quickpayTotals(payment);
 for(const row of totals.rows){const key=payment.id+':'+row.id;if(f.payments.some(p=>p.key===key))continue;f.payments.push({...row,key,paymentId:payment.id,reference:payment.order_id,verifiedAt:stamp()});
  if(row.type==='capture'&&!order.adminTest&&!order.adminLiveTest&&payment.test_mode===false){
   f.mail.push({key:'receipt:'+key,kind:'payment_receipt',status:'review',to:order.shipping.email,amount:row.amount,paymentId:payment.id,operationId:row.id,paidAt:row.at||stamp(),createdAt:stamp()});
  }
 }
 return totals;
}
export async function saveVerifiedPayment(order,payment){return withLedger(data=>recordVerifiedPayment(ledgerOrder(data,order.id),order,payment));}
export async function updateFinance(id,input){
 const order=await readCheckout(id);
 return withLedger(async data=>{
  const f=ledgerOrder(data,id),config=financeConfiguration();
  if(input.action==='billing'){const b=input.billing||{};for(const k of ['company','street','postalCode','city','country','email'])if(typeof b[k]!=='string'||!b[k].trim()||b[k].length>254)throw Error('Udfyld alle faktureringsoplysninger.');if(!/^\S+@\S+\.\S+$/.test(b.email)||b.country!=='DK')throw Error('Gyldig e-mail og dansk fakturaland kræves; udland afklares særskilt.');if(b.ean&&!/^\d{13}$/.test(b.ean))throw Error('EAN skal være 13 cifre.');const clean=Object.fromEntries(['company','street','postalCode','city','country','email','cvr','ean','reference'].map(k=>[k,String(b[k]||'').trim().slice(0,254)]));await updateCheckout(id,o=>{o.billing=clean;return o;});f.events.push({at:stamp(),type:'billing_updated'});return {ok:true};}
  if(input.action==='request_full_invoice'){
   if(!input.reason?.trim())throw Error('Angiv årsag/reference til fakturaønsket.');
   f.fullInvoiceRequested=true;f.events.push({at:stamp(),type:'full_invoice_requested',reason:String(input.reason).slice(0,500)});return {ok:true};
  }
  if(input.action==='register_document'){
   if(config.numberingAuthority!=='economic'||!config.series)throw Error('Aftalt nummerserie og e-conomic som eneste nummeransvarlige skal konfigureres.');
   const kind=input.kind;if(!['invoice','credit','replacement'].includes(kind))throw Error('Ukendt bilagstype.');
   const number=String(input.number||'').trim();if(!/^[a-zA-Z0-9/-]{1,50}$/.test(number)||input.series!==config.series)throw Error('Angiv fakturanummer fra aftalt nummerserie.');
   const pdf=Buffer.from(input.pdf||'','base64');if(pdf.length<100||pdf.length>10*1024*1024||pdf.subarray(0,5).toString()!=='%PDF-')throw Error('Vedhæft det udstedte PDF-bilag.');
   try{const parsed=await PDFDocument.load(pdf);if(!parsed.getPageCount())throw Error();}catch{throw Error('Bilaget skal være en læsbar PDF.');}
   if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date||'')||!Number.isFinite(Date.parse(input.date))||Date.parse(input.date)>Date.now())throw Error('Angiv gyldig bilagsdato.');
   if(!Number.isSafeInteger(input.total)||input.total<=0||!Number.isSafeInteger(input.vat)||input.vat<0||input.vat>input.total)throw Error('Angiv bilagsbeløb og moms i øre.');
   const hash=createHash('sha256').update(pdf).digest('hex'),existing=Object.entries(data.orders).flatMap(([orderId,v])=>v.documents.map(d=>({...d,orderId}))).find(d=>d.number===number&&d.series===input.series);
   if(existing){if(existing.orderId===id&&existing.hash===hash&&existing.kind===kind&&existing.total===input.total&&existing.vat===input.vat&&existing.original===input.original&&existing.shipmentKey===input.shipmentKey)return {id:existing.id};throw Error('Bilagsnummeret er allerede registreret; et udstedt bilag må ikke overskrives.');}
   const original=f.documents.find(d=>d.id===input.original);
   if(kind==='invoice'){
    const policy=invoicePolicy({...order,finance:f});if(policy.problems.length)throw Error(policy.problems.join(' '));
    const s=f.shipments.find(s=>s.key===input.shipmentKey);if(!s||s.total!==input.total||s.vat!==input.vat||f.documents.some(d=>d.kind==='invoice'&&d.shipmentKey===s.key))throw Error('Fakturaen skal svare til én endnu ikke faktureret levering.');
    s.invoiceStatus='issued';
   }else{
    if(!original||original.kind!=='invoice'||!input.reason?.trim())throw Error('Vælg oprindelig faktura og beskriv korrektionen.');
    const credits=f.documents.filter(d=>d.kind==='credit'&&d.original===original.id);
    if(kind==='credit'&&(input.total+credits.reduce((n,d)=>n+d.total,0)>original.total||input.vat+credits.reduce((n,d)=>n+d.vat,0)>original.vat))throw Error('Kreditnota overstiger den oprindelige faktura.');
    if(kind==='replacement'&&(input.total!==original.total||input.vat!==original.vat||(credits.length&&(credits.reduce((n,d)=>n+d.total,0)!==original.total||credits.reduce((n,d)=>n+d.vat,0)!==original.vat))||f.documents.some(d=>d.kind==='replacement'&&d.original===original.id)))throw Error('Senere fuld faktura uden ny omsætning kræver samme beløb/moms og afstemt original. Kreditnota og ny faktura skal håndteres af Financial Outsourcing.');
   }
   const correctionPosting=kind==='replacement'&&f.documents.some(d=>d.kind==='credit'&&d.original===input.original);if(correctionPosting&&f.operations.some(o=>o.kind==='refund'&&o.status!=='failed'&&f.documents.some(d=>d.id===o.documentId&&d.original===input.original)))throw Error('En refundering er allerede tilknyttet korrektionen. Afstem før erstatningsfaktura.');
   const doc={id:randomUUID(),kind,correctionPosting,number,series:input.series,date:input.date,total:input.total,vat:input.vat,shipmentKey:input.shipmentKey,original:input.original,reason:String(input.reason||'').slice(0,1000),hash,pdf:pdf.toString('base64'),registeredAt:stamp(),seller};f.documents.push(doc);f.events.push({at:stamp(),type:'document_registered',documentId:doc.id});return {id:doc.id};
  }
  if(input.action==='settlement'){
   const s=validateSettlement(input.settlement),existing=f.settlements.find(r=>r.reference===s.reference);
   if(existing){if(JSON.stringify(existing)!==JSON.stringify(s))throw Error('Afregningsreferencen findes med andre beløb.');return {ok:true};}
   const summary=financeSummary(order,f);if(s.gross>summary.unallocated||s.refunds+f.settlements.reduce((n,r)=>n+r.refunds,0)>summary.refunded)throw Error('Afregningen overstiger verificerede betalinger/refunderinger.');
   f.settlements.push(s);return {ok:true};
  }
  throw Error('Ukendt økonomihandling.');
 });
}
