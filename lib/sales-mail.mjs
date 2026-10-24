import {randomUUID,createHash} from 'node:crypto';
import {salesBasisPDF,salesBasis} from './sales-basis.mjs';
import nodemailer from 'nodemailer';
import {contactConfiguration} from './contact.mjs';
import {readCheckout} from './checkout.mjs';
import {financeConfiguration,withLedger} from './sales-ledger.mjs';
import {seller} from './sales-finance.mjs';
const money=n=>(n/100).toLocaleString('da-DK',{style:'currency',currency:'DKK'});
export async function sendFinanceMail(id,key,{env=process.env,transport,automatic=false,confirmedNotSent=false}={}){
 const config=contactConfiguration(env),finance=financeConfiguration(env);if(!config.ready&&!transport)throw Error('Mailopsætning mangler.');
 return withLedger(async(data,persist)=>{
  const f=data.orders[id],row=f?.mail.find(m=>m.key===key);if(!row)throw Error('Kvitteringen findes ikke.');
  if(row.status==='sent')return row;
  if(['uncertain','sending'].includes(row.status)&&!confirmedNotSent)throw Error('Kontrollér mailkontoen og bekræft, at kvitteringen ikke er sendt, før genforsøg.');
  if(automatic&&((row.kind==='accountant_basis'?finance.accountantMail:finance.receiptMail)!=='automatic'||row.status!=='review'))return row;
  const order=await readCheckout(id),payment=f.payments.find(p=>p.type==='capture'&&p.paymentId===row.paymentId&&p.id===row.operationId);
  if((row.kind==='payment_receipt'&&(!payment||payment.amount!==row.amount))||order.adminTest||order.adminLiveTest)throw Error('En verificeret hævning kræves.');
  const text=row.kind==='accountant_basis'?row.text:[`Smerch – betalingskvittering`,`Vi har modtaget ${money(row.amount)}.`,`Ordre: ${id}`,`Quickpay-transaktion: ${row.paymentId}`,`Hævning: ${row.operationId}`,`Betalingsdato: ${row.paidAt}`,'Kvitteringen dokumenterer betalingen og er ikke en faktura. En eventuel faktura vedrører samme salg og er ikke en ny opkrævning.',`${seller.name} · CVR ${seller.cvr}`,seller.address].join('\n');
  row.status='sending';row.text=text;await persist();
  try{const sender=transport||nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},requireTLS:!config.secure});const result=await sender.sendMail({from:{name:'Smerch',address:config.user},to:row.to,subject:row.kind==='accountant_basis'?'Smerch – fakturagrundlag':'Smerch – betalingskvittering',messageId:row.kind==='accountant_basis'?`<basis-${row.id}@smerch.dk>`:`<payment-${row.paymentId}-${row.operationId}@smerch.dk>`,text,attachments:row.pdf?[{filename:'Smerch-fakturagrundlag.pdf',content:Buffer.from(row.pdf,'base64'),contentType:'application/pdf'}]:[],disableFileAccess:true,disableUrlAccess:true});if(result.rejected?.length)throw Error('Modtager afvist');row.status='sent';row.sentAt=new Date().toISOString();delete row.error;}catch{row.status='uncertain';row.error='Mailens udfald skal kontrolleres før genforsøg.';}await persist();return row;
 });
}

export async function queueAccountantBasis(id,shipmentKey,{env=process.env}={}){
 const config=financeConfiguration(env);if(!/^\S+@\S+\.\S+$/.test(config.accountantEmail||''))throw Error('Financial Outsourcings modtageradresse mangler.');
 const order=await readCheckout(id);if(order.adminTest||order.adminLiveTest)throw Error('Testordrer må ikke sendes til bogholder.');
 return withLedger(async(data,persist)=>{const f=data.orders[id],shipment=f?.shipments.find(s=>s.key===shipmentKey);if(!shipment)throw Error('Leverancen findes ikke.');const basis=salesBasis(order,shipment,f),version=createHash('sha256').update(JSON.stringify({customer:basis.customer,shipment,fullInvoiceRequested:f.fullInvoiceRequested===true})).digest('hex').slice(0,16);const key='basis:'+shipmentKey+':'+version,existing=f.mail.find(m=>m.key===key);if(existing)return existing;const pdf=await salesBasisPDF(order,shipment,f);const row={id:randomUUID(),key,kind:'accountant_basis',status:'review',to:config.accountantEmail,createdAt:new Date().toISOString(),pdf:Buffer.from(pdf).toString('base64'),text:`Fakturagrundlag for ${id}. Leverance ${shipmentKey}. Opret faktura i den aftalte nummerserie, og registrér PDF og nummer på ordren. Betaling håndteres via Smerch/Quickpay; der må ikke opkræves eller bogføres samme salg igen.`};f.mail.push(row);return row;});
}
