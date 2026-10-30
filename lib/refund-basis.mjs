import {documentOrderNumber,withDocumentOrderNumbers} from './document-order-number.mjs';
import {randomUUID} from 'node:crypto';
import {readCheckout} from './checkout.mjs';
import {withLedger,financeConfiguration} from './sales-ledger.mjs';
import {salesBasis} from './sales-basis.mjs';
import {renderBrandedDocument} from './invoice-basis-pdf.mjs';
export function refundBasis(order,finance,input){
 if(order.quote?.currency&&order.quote.currency!=='DKK')throw Error('Kun DKK understøttes.');
 if(order.adminTest||order.adminLiveTest||order.paymentMode==='test')throw Error('Testordrer må ikke bruges til bogføring.');
 const payment=finance.payments.find(p=>p.key===input.paymentKey&&p.type==='refund');
 if(!payment||!payment.at)throw Error('Grundlaget kræver en verificeret refundering med dato. Afstem med Quickpay først.');
 if(!Array.isArray(input.items)||!input.items.length)throw Error('Angiv hvilke varer refunderingen vedrører.');
 const seen=new Set();
 const lines=input.items.map(item=>{
  const source=order.lines[item.index],quote=order.quote?.lines?.[item.index];
  if(!source||seen.has(item.index)||!Number.isSafeInteger(item.quantity)||item.quantity<=0||item.quantity>source.quantity||!Number.isSafeInteger(item.net)||item.net<0||!Number.isSafeInteger(quote?.net)||item.net>quote.net)throw Error('Ugyldigt vareantal eller refunderet linjebeløb.');
  seen.add(item.index);return {index:item.index,description:order.productNames?.[source.productId]||source.productName||source.productId,sku:source.sku,quantity:item.quantity,net:item.net};
 });
 if(!Number.isSafeInteger(input.freight)||input.freight<0||input.freight>order.freightExVat||!Number.isSafeInteger(input.vat)||input.vat<0)throw Error('Kontrollér refunderet fragt og moms.');
 const originalVat=order.totalIncVat-(order.quote?.net??order.quote.lines.reduce((n,l)=>n+l.net,0))-order.freightExVat;if(input.vat>originalVat)throw Error('Refunderet moms overstiger ordrens moms.');
 const net=lines.reduce((n,l)=>n+l.net,0)+input.freight,total=net+input.vat;
 if(total!==payment.amount)throw Error('Varer, fragt og moms skal svare præcist til den bekræftede refundering.');
 if(!input.reason?.trim())throw Error('Angiv årsag til refunderingen.');
 const op=finance.operations.find(o=>o.kind==='refund'&&o.status==='confirmed'&&o.providerOperationId===payment.id&&o.paymentId===payment.paymentId);
 const credit=finance.documents.find(d=>d.id===op?.documentId),original=finance.documents.find(d=>d.id===credit?.original);
 const d=salesBasis(order,{key:'Refundering '+payment.key,shipDate:payment.at,lines,freight:input.freight,net,vat:input.vat,total},finance);
 return {...d,accountingReference:payment.reference||(payment.paymentId===order.quickpayPaymentId?order.quickpayOrderId:''),quickpayPaymentId:payment.paymentId,type:'refund_basis',paymentStatus:'Refunderet – bekræftet af betalingsudbyderen',paymentTerms:'Ingen ny opkrævning eller tilbagebetaling. Grundlag til bogholderens kreditnota og afstemning.',notes:[`Oprindelig ordre nr: ${documentOrderNumber(order)}.`,`Refundering: ${payment.paymentId}/${payment.id}.`,`Refunderingsdato: ${payment.at}.`,`Oprindelig faktura: ${original?.number||'Skal matches af bogholderen via ordre og betalingsreference'}.`,credit?`Eksisterende kreditnota: ${credit.number}. Udlig denne; opret ikke en ny kreditnota for samme refundering.`:'Opret kreditnota mod den oprindelige faktura, hvis den ikke allerede findes.',`Årsag: ${input.reason.trim().slice(0,2000)}`].join('\n')};
}
export async function queueRefundBasis(id,input,{env=process.env}={}){
 const order=await withDocumentOrderNumbers(await readCheckout(id)),to=financeConfiguration(env).accountantEmail;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to||''))throw Error('Bogholderens e-mail mangler.');
 return withLedger(async data=>{
  const finance=data.orders[id];if(!finance)throw Error('Afstem betalingerne først.');
  const d=refundBasis(order,finance,input),key='refund-basis:'+input.paymentKey;
  const existing=finance.mail.find(m=>m.key===key);
  if(existing){if(JSON.stringify(existing.refundInput)!==JSON.stringify(input))throw Error('Der findes allerede et grundlag for denne refundering. Afstem det eksisterende bilag.');return {key,status:existing.status};}
  const pdf=await renderBrandedDocument(d);
  finance.mail.push({id:randomUUID(),key,kind:'refund_basis',status:'review',requiresReview:true,to,paymentKey:input.paymentKey,refundInput:input,createdAt:new Date().toISOString(),pdf:Buffer.from(pdf).toString('base64'),text:`Refunderingsgrundlag · Ordre nr: ${d.reference}. ${d.notes}\nBeløbet er allerede refunderet. Afstem kreditnotaen i e-conomic; refundér ikke igen.`});
  return {key,status:'review'};
 });
}
