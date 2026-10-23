import {readOrderDocument} from './order-documents.mjs';
import {addCorrespondence} from './order-correspondence.mjs';
// A message refers to one immutable PDF version. Sending does not regenerate it.
export async function sendOrderDocument(order,input,options={}){
 const record=await readOrderDocument(order.id,input.documentId),d=record.document;
 const audience=d.type==='basis'?'accountant':'customer';
 if(input.audience!==audience)throw Error(d.type==='basis'?'Fakturagrundlag må kun sendes til bogholderen.':'Vælg kunden som modtager.');
 const to=String(input.to||'').trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))throw Error('Kontrollér modtageradresse.');
 const subject=String(input.subject||'').trim(),text=String(input.text||'').trim();
 return addCorrespondence(order,{kind:'email',subject,text,requestId:input.requestId},{...options,message:{action:'document',to,audience,documentId:record.id,documentVersion:record.version,attachments:[{filename:`Smerch-${d.type}-${record.version||record.id}.pdf`,content:Buffer.from(record.pdf,'base64'),contentType:'application/pdf'}]}});
}
