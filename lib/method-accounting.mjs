import {createHash,randomUUID} from 'node:crypto';
import nodemailer from 'nodemailer';
import {readCheckout} from './checkout.mjs';
import {withDocumentOrderNumbers,documentOrderNumber} from './document-order-number.mjs';
import {withLedger,ledgerOrder} from './sales-ledger.mjs';
import {bankInvoiceBasis} from './bank-invoice-basis.mjs';
import {invoicePolicy} from './sales-finance.mjs';

// Applied by the server to new checkouts only. Never infer or migrate this from
// a date, payment status or an existing mail row.
export const METHOD_ACCOUNTING='payment-method-v1';
export const methodAccounting=order=>order.accountingWorkflow===METHOD_ACCOUNTING;
export function initializeMethodAccounting(order){
 if(['quickpay','bank_transfer'].includes(order.paymentProvider))order.accountingWorkflow=METHOD_ACCOUNTING;
 return order;
}
export const methodAccountantMail=row=>['accountant_payment_receipt','accountant_invoice_request'].includes(row.kind);
const stamp=()=>new Date().toISOString();
const sha=value=>createHash('sha256').update(value).digest('hex');
const validEmail=value=>typeof value==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
function assertOrder(order){
 if(!methodAccounting(order)||order.adminTest||order.adminLiveTest)throw Error('Bogholderforløbet kræver en almindelig ordre med den nye betalingsmodel.');
}
function invoiceSnapshot(order){
 assertOrder(order);
 if(order.paymentProvider!=='bank_transfer'||order.status!=='awaiting_bank_payment')throw Error('Fakturagrundlag kræver en aktiv fakturaordre.');
 if(order.bankPayment?.invoiceNumber||order.bankPayment?.invoicedAt)throw Error('Fakturaen er allerede registreret; bestil ikke en ny.');
 if(!validEmail(order.billing?.email||order.shipping?.email)||!Number.isSafeInteger(order.totalIncVat)||order.totalIncVat<=0||!Number.isSafeInteger(order.quote?.net)||!Number.isSafeInteger(order.freightExVat)||order.quote.net+order.freightExVat>order.totalIncVat)throw Error('Fakturaordrens kundeoplysninger eller beløb skal afstemmes.');
 const problems=invoicePolicy(order).problems;if(problems.length)throw Error(problems.join(' '));
 return bankInvoiceBasis(order);
}
function verifiedCapture(order,finance,key){
 assertOrder(order);
 const payment=finance.payments.find(p=>p.key===key&&p.type==='capture');
 if(order.paymentProvider!=='quickpay'||order.paymentMode!=='live'||!payment||payment.testMode!==false||payment.paymentId!==order.quickpayPaymentId||payment.reference!==order.quickpayOrderId||!Number.isSafeInteger(payment.amount)||payment.amount!==order.totalIncVat||order.status!=='paid'||!Number.isFinite(Date.parse(payment.at))||!Number.isFinite(Date.parse(payment.verifiedAt))||Date.parse(payment.at)>Date.now()||Date.parse(payment.verifiedAt)>Date.now())throw Error('En verificeret live Quickpay-hævning med korrekte referencer kræves.');
 if(finance.payments.some(p=>p.type==='refund')||finance.operations.some(p=>['requested','uncertain'].includes(p.status)))throw Error('Betalingen skal afstemmes før bogholderkvitteringen.');
 return payment;
}
export async function queueMethodAccountantMail(id,{finance:config}={}){
 if(!validEmail(config?.accountantEmail))throw Error('Bogholderens modtageradresse mangler.');
 const order=await withDocumentOrderNumbers(await readCheckout(id));assertOrder(order);
 return withLedger(data=>{
  const f=ledgerOrder(data,id),rows=[];
  if(order.paymentProvider==='bank_transfer'){
   const key='invoice-request:'+id,existing=f.mail.find(m=>m.key===key);if(existing)return [existing];
   if(order.bankPayment?.invoiceNumber||order.bankPayment?.invoicedAt||order.status!=='awaiting_bank_payment')return [];
   const html=invoiceSnapshot(order),row={id:randomUUID(),key,kind:'accountant_invoice_request',status:'review',to:config.accountantEmail,createdAt:stamp(),snapshotHash:sha(html),basisHTML:html,orderNumber:documentOrderNumber(order)};
   f.mail.push(row);rows.push(row);
  }else if(order.paymentProvider==='quickpay'){
   for(const payment of f.payments.filter(p=>p.type==='capture')){
    const key='accountant-receipt:'+payment.key,existing=f.mail.find(m=>m.key===key);if(existing){rows.push(existing);continue;}
    const capture=verifiedCapture(order,f,payment.key),row={id:randomUUID(),key,kind:'accountant_payment_receipt',status:'review',to:config.accountantEmail,createdAt:stamp(),paymentKey:capture.key,paymentId:capture.paymentId,operationId:capture.id,reference:capture.reference,amount:capture.amount,paidAt:capture.at,orderNumber:documentOrderNumber(order)};
    f.mail.push(row);rows.push(row);
   }
  }return rows;
 });
}
// Called under the existing durable sales-ledger lock. The persisted intent and
// uncertain-result policy are shared by automatic delivery and staff retry.
export async function sendMethodAccountantMail({id,row,finance:ledger,persist,config,settings,env,transport,automatic,confirmedNotSent}){
 if(row.status==='sent'||row.status==='obsolete')return row;
 if(['uncertain','sending'].includes(row.status)&&!confirmedNotSent)throw Error('Kontrollér mailkontoen før genforsøg af bogholdermailen.');
 if(automatic&&(env.SMERCH_ACCOUNTANT_MAIL!=='automatic'||row.status!=='review'||row.requiresReview===true))return row;
 if(!validEmail(row.to)||row.to.toLowerCase()!==settings.accountantEmail?.toLowerCase())throw Error('Bogholdermodtageren er ændret; afstem før afsendelse.');
 const order=await readCheckout(id);assertOrder(order);
 let text,subject,attachments=[];
 if(row.kind==='accountant_invoice_request'){
  if(order.paymentProvider!=='bank_transfer')throw Error('Fakturaanmodning må kun sendes for valgt fakturabetaling.');
  if(order.bankPayment?.invoicedAt||order.bankPayment?.invoiceNumber||order.status==='paid'||order.status==='cancelled'){row.status='obsolete';row.reason='Fakturaen er allerede håndteret eller ordren afsluttet.';await persist();return row;}
  const current=invoiceSnapshot(order);if(sha(current)!==row.snapshotHash||sha(row.basisHTML||'')!==row.snapshotHash)throw Error('Fakturagrundlaget er ændret; gennemgå det før afsendelse.');
  subject='Smerch – fakturaordre '+row.orderNumber;
  text=`Kunden har valgt fakturabetaling. Ordre nr: ${row.orderNumber}. Brug det vedhæftede fakturagrundlag/ordrekvitteringen til at udarbejde fakturaen i e-conomic. Send fakturaen til kunden på ${order.billing?.email||order.shipping.email}, og send også en kopi til Smerch som svar på denne mail. Kunden skal betale ved bankoverførsel efter de vedhæftede forudbetalingsvilkår. Dette er en fakturaanmodning, ikke en betalingskvittering; beløbet er ikke hævet via Quickpay. Opret kun én faktura for ordren. Smerch registrerer manuelt, når fakturaen er sendt og betalingen modtaget.`;
  attachments=[{filename:'Smerch-fakturagrundlag.html',content:row.basisHTML,contentType:'text/html; charset=utf-8'}];
 }else{
  const payment=verifiedCapture(order,ledger,row.paymentKey);
  if(payment.amount!==row.amount||payment.id!==row.operationId||payment.paymentId!==row.paymentId||payment.reference!==row.reference||payment.at!==row.paidAt)throw Error('Bogholderkvitteringen matcher ikke hævningen.');
  subject='Smerch – Quickpay-betalingskvittering '+row.orderNumber;
  text=[`Betalingskvittering til bogholderens afstemning.`,`Ordre nr: ${row.orderNumber}`,`Hævet beløb: ${(row.amount/100).toLocaleString('da-DK',{style:'currency',currency:'DKK'})}`,`Quickpay order_id / Clearhaus Reference: ${row.reference}`,`Quickpay-transaktion: ${row.paymentId}`,`Hævningsoperation: ${row.operationId}`,`Hævningstidspunkt: ${row.paidAt}`,'Kunden har betalt med kort/MobilePay via Quickpay. Brug kvitteringen til at udligne beløbet ved afstemning af Quickpay-udbetalingen. Der skal ikke udarbejdes eller sendes en faktura for denne ordre. Kvitteringen må ikke udløse en ny opkrævning.'].join('\n');
 }
 row.status='sending';row.attemptedAt=stamp();row.text=text;await persist();
 try{
  const sender=transport||nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},requireTLS:!config.secure});
  const result=await sender.sendMail({from:{name:'Smerch',address:config.user},replyTo:config.user,to:row.to,subject,text,attachments,messageId:`<accountant-${row.id}@smerch.dk>`,disableFileAccess:true,disableUrlAccess:true});
  if(result.rejected?.length||!result.accepted?.some(to=>String(to).toLowerCase()===row.to.toLowerCase()))throw Error('SMTP acceptance missing');
  row.status='sent';row.sentAt=stamp();delete row.error;
 }catch{row.status='uncertain';row.error='Bogholdermailens udfald skal kontrolleres før genforsøg.';}
 await persist();return row;
}
