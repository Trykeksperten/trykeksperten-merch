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
export async function queueMethodAccountantMail(id,{finance:config}={}){
 const order=await withDocumentOrderNumbers(await readCheckout(id));assertOrder(order);
 if(order.paymentProvider!=='bank_transfer')return [];
 return withLedger(data=>{
  const f=ledgerOrder(data,id),key='invoice-request:'+id;
  const existing=f.mail.find(m=>m.key===key);if(existing)return [existing];
  if(order.bankPayment?.invoiceNumber||order.bankPayment?.invoicedAt||order.status!=='awaiting_bank_payment')return [];
  if(!validEmail(config?.accountantEmail))throw Error('Bogholderens modtageradresse mangler.');
  const html=invoiceSnapshot(order),row={id:randomUUID(),key,kind:'accountant_invoice_request',status:'review',to:config.accountantEmail,createdAt:stamp(),snapshotHash:sha(html),basisHTML:html,orderNumber:documentOrderNumber(order)};
  f.mail.push(row);
  return [row];
 });
}
// Called under the existing durable sales-ledger lock. The persisted intent and
// uncertain-result policy are shared by automatic delivery and staff retry.
export async function sendMethodAccountantMail({id,row,persist,config,settings,env,transport,automatic,confirmedNotSent}){
 if(row.status==='sent'||row.status==='obsolete')return row;
 if(['uncertain','sending'].includes(row.status)&&!confirmedNotSent)throw Error('Kontrollér mailkontoen før genforsøg af bogholdermailen.');
 if(automatic&&(env.SMERCH_ACCOUNTANT_MAIL!=='automatic'||row.status!=='review'||row.requiresReview===true))return row;
 if(!validEmail(settings.accountantEmail))throw Error('Bogholderens modtageradresse er ugyldig.');
 if(!validEmail(row.to)||row.to.toLowerCase()!==settings.accountantEmail?.toLowerCase())throw Error('Bogholdermodtageren er ændret; afstem før afsendelse.');
 const order=await readCheckout(id);assertOrder(order);
 if(order.paymentProvider!=='bank_transfer')throw Error('Fakturaanmodning må kun sendes for valgt fakturabetaling.');
 if(order.bankPayment?.invoicedAt||order.bankPayment?.invoiceNumber||order.status==='paid'||order.status==='cancelled'){row.status='obsolete';row.reason='Fakturaen er allerede håndteret eller ordren afsluttet.';await persist();return row;}
 const current=invoiceSnapshot(order);if(sha(current)!==row.snapshotHash||sha(row.basisHTML||'')!==row.snapshotHash)throw Error('Fakturagrundlaget er ændret; gennemgå det før afsendelse.');
 const subject='Smerch – fakturaordre '+row.orderNumber;
 const text=`Kunden har valgt fakturabetaling. Ordre nr: ${row.orderNumber}. Brug det vedhæftede fakturagrundlag/ordrekvitteringen til at udarbejde fakturaen i e-conomic. Send fakturaen til kunden på ${order.billing?.email||order.shipping.email}, og send også en kopi til Smerch som svar på denne mail. Kunden skal betale ved bankoverførsel efter de vedhæftede forudbetalingsvilkår. Dette er en fakturaanmodning, ikke en betalingskvittering; beløbet er ikke hævet via Quickpay. Opret kun én faktura for ordren. Smerch registrerer manuelt, når fakturaen er sendt og betalingen modtaget.`;
 const attachments=[{filename:'Smerch-fakturagrundlag.html',content:row.basisHTML,contentType:'text/html; charset=utf-8'}];
 row.status='sending';row.attemptedAt=stamp();row.text=text;await persist();
 try{
  const sender=transport||nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},requireTLS:!config.secure});
  const result=await sender.sendMail({from:{name:'Smerch',address:config.user},replyTo:config.user,to:row.to,subject,text,attachments,messageId:`<accountant-${row.id}@smerch.dk>`,disableFileAccess:true,disableUrlAccess:true});
  if(result.rejected?.length||!result.accepted?.some(to=>String(to).toLowerCase()===row.to.toLowerCase()))throw Error('SMTP acceptance missing');
  row.status='sent';row.sentAt=stamp();delete row.error;
 }catch{row.status='uncertain';row.error='Bogholdermailens udfald skal kontrolleres før genforsøg.';}
 await persist();return row;
}
