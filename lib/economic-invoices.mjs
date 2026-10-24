// Draft-only integration. Booking is deliberately performed by staff in e-conomic.
import {readCheckout,listCheckouts,updateCheckout} from './checkout.mjs';
const positive=value=>Number.isInteger(Number(value))&&Number(value)>0&&Number(value)<=999999999;
const stamp=()=>new Date().toISOString();
const escapeFilter=value=>String(value).replace(/[$()*,\[\]]/g,char=>'$'+char);
const collection=(path,field,value)=>`${path}?${new URLSearchParams({filter:`${field}$eq:${escapeFilter(value)}`,pagesize:'100'})}`;
export function economicConfiguration(env=process.env){
 const required=['ECONOMIC_APP_SECRET_TOKEN','ECONOMIC_AGREEMENT_GRANT_TOKEN','ECONOMIC_CUSTOMER_GROUP_NUMBER','ECONOMIC_PAYMENT_TERMS_NUMBER','ECONOMIC_LAYOUT_NUMBER','ECONOMIC_VAT_ZONE_NUMBER','ECONOMIC_PRODUCT_NUMBER','ECONOMIC_FREIGHT_PRODUCT_NUMBER'];
 const missing=required.filter(key=>!env[key]||(key.endsWith('_NUMBER')&&!key.includes('PRODUCT')&&!positive(env[key])));
 return {enabled:env.ECONOMIC_ENABLED==='1',ready:env.ECONOMIC_ENABLED==='1'&&!missing.length,manualApproval:true,missing};
}
export function economicClient({env=process.env,fetchImpl=fetch}={}){
 return async(path,{method='GET',body}={})=>{
  const url=new URL(path,'https://restapi.e-conomic.com');
  if(url.origin!=='https://restapi.e-conomic.com'||url.username||url.password||!['GET','POST'].includes(method)||method==='POST'&&!['/customers','/invoices/drafts'].includes(url.pathname))throw Error('Integrationen må kun oprette kunder og fakturakladder. Bogfør manuelt i e-conomic.');
  let response;try{response=await fetchImpl(url,{method,redirect:'error',headers:{'X-AppSecretToken':env.ECONOMIC_APP_SECRET_TOKEN,'X-AgreementGrantToken':env.ECONOMIC_AGREEMENT_GRANT_TOKEN,'Content-Type':'application/json',Accept:'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});}catch{throw Error('Forbindelsen til e-conomic blev afbrudt. Kontrollér udfaldet, før du opretter noget igen.');}
  if(!response.ok)throw Error(`e-conomic svarede med HTTP ${response.status}. Kontrollér adgang og opsætning.`);
  try{return await response.json();}catch{throw Error('Svaret fra e-conomic kunne ikke læses. Kontrollér udfaldet i e-conomic.');}
 };
}
function invoiceCustomer(order,env){const s=order.shipping,b=order.billing;return {name:b?.company||s.name,email:b?.email||s.email,address:s.street,zip:s.postalCode,city:s.city,country:'Danmark',currency:'DKK',mobilePhone:s.phone,...(b?.cvr?{corporateIdentificationNumber:b.cvr}:{}),customerGroup:{customerGroupNumber:Number(env.ECONOMIC_CUSTOMER_GROUP_NUMBER)},paymentTerms:{paymentTermsNumber:Number(env.ECONOMIC_PAYMENT_TERMS_NUMBER)},vatZone:{vatZoneNumber:Number(env.ECONOMIC_VAT_ZONE_NUMBER)}};}
export function economicDraft(order,customerNumber,env=process.env){
 if(!positive(customerNumber)||!Array.isArray(order.quote?.lines)||order.quote.lines.length!==order.lines.length)throw Error('Fakturagrundlaget mangler.');
 const recipient=invoiceCustomer(order,env),lines=order.lines.map((line,i)=>({lineNumber:i+1,sortKey:i+1,product:{productNumber:env.ECONOMIC_PRODUCT_NUMBER},quantity:1,unitNetPrice:order.quote.lines[i].net/100,description:`${line.quantity} stk. ${line.productName||line.productId} · ${line.sku}${line.decorations?.length?' · inkl. tryk og opstart':''}`}));
 lines.push({lineNumber:lines.length+1,sortKey:lines.length+1,product:{productNumber:env.ECONOMIC_FREIGHT_PRODUCT_NUMBER},quantity:1,unitNetPrice:order.freightExVat/100,description:'Fragt'});
 if(lines.some(line=>!Number.isFinite(line.unitNetPrice)||line.unitNetPrice<0)||Math.round(lines.reduce((sum,line)=>sum+line.unitNetPrice,0)*100)!==order.quote.net+order.freightExVat)throw Error('Fakturabeløbene stemmer ikke med ordren.');
 return {date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Copenhagen'}).format(new Date()),currency:'DKK',customer:{customerNumber:Number(customerNumber)},recipient:{name:recipient.name,address:recipient.address,zip:recipient.zip,city:recipient.city,country:recipient.country,vatZone:recipient.vatZone},delivery:{address:order.shipping.street,zip:order.shipping.postalCode,city:order.shipping.city,country:'Danmark'},paymentTerms:recipient.paymentTerms,layout:{layoutNumber:Number(env.ECONOMIC_LAYOUT_NUMBER)},references:{other:order.id},notes:{heading:'Din ordre hos Smerch',textLine1:`Ordre: ${order.id}${order.billing?.reference?' · Reference: '+order.billing.reference:''}`,textLine2:'Betaling håndteres via smerch.dk. Dette er ikke en ny betalingsanmodning.'},lines};
}
export function assertInvoiceMatches(invoice,order,customerNumber){
 if(invoice.references?.other!==order.id||invoice.currency!=='DKK'||Number(invoice.customer?.customerNumber)!==Number(customerNumber)||!Number.isFinite(invoice.grossAmount)||Math.round(invoice.grossAmount*100)!==order.totalIncVat||!Number.isFinite(invoice.netAmount)||Math.round(invoice.netAmount*100)!==order.quote.net+order.freightExVat)throw Error('Fakturaens kunde, ordreference eller beløb afviger fra ordren. Kontrollér fakturaen manuelt.');
}
function eligible(order){return !order.adminTest&&!order.adminLiveTest&&['authorized','paid'].includes(order.status)&&order.paymentProvider==='quickpay'&&order.paymentMode==='live';}
async function saveInvoice(id,patch){return updateCheckout(id,order=>{order.invoice={...order.invoice,...patch,manualApproval:true,updatedAt:stamp()};return order;});}
// Serialize all accounting calls in this process, including customer reuse.
let sequence=Promise.resolve();
export function syncEconomicInvoice(id,options={}){const result=sequence.then(()=>sync(id,options));sequence=result.catch(()=>{});return result;}
async function sync(id,{env=process.env,fetchImpl=fetch}={}){
 if(env.SMERCH_FINANCE_ENABLED==='1')throw Error('Fakturering styres af leverancegrundlag og Financial Outsourcing. Den gamle kladdeintegration er deaktiveret.');
 const config=economicConfiguration(env);if(!config.ready)throw Error('e-conomic er ikke tilsluttet og færdigopsat.');
 let order=await readCheckout(id);if(!eligible(order))throw Error('Kun bekræftede liveordrer med aktiv reservation eller hævet betaling kan få en fakturakladde.');
 const api=economicClient({env,fetchImpl});
 try{
  // Search both collections before any creation, including after an interrupted POST.
  const [booked,drafts]=await Promise.all([api(collection('/invoices/booked','references.other',id)),api(collection('/invoices/drafts','references.other',id))]);
  if(!Array.isArray(booked.collection)||!Array.isArray(drafts.collection)||booked.pagination?.nextPage||drafts.pagination?.nextPage)throw Error('Fakturaopslaget skal afstemmes manuelt.');
  const found=[...booked.collection,...drafts.collection];
  if(found.some(row=>row.references?.other!==id))throw Error('Fakturaopslaget kunne ikke afgrænses sikkert til ordren. Afstem manuelt.');
  if(found.length>1)throw Error('Flere fakturaer har samme ordreference. Afstem dem manuelt i e-conomic.');
  if(found.length){const row=found[0],isBooked=positive(row.bookedInvoiceNumber),number=isBooked?row.bookedInvoiceNumber:row.draftInvoiceNumber,full=await api(`/invoices/${isBooked?'booked':'drafts'}/${number}`);
   if(!order.invoice?.customerNumber)throw Error('Fakturaen findes allerede. Kunden skal afstemmes manuelt, før fakturaen kan tilknyttes.');
   assertInvoiceMatches(full,order,order.invoice.customerNumber);
   await saveInvoice(id,{status:isBooked?'booked':'draft',...(isBooked?{bookedInvoiceNumber:number}:{draftInvoiceNumber:number}),error:null,lastCheckedAt:stamp()});return (await readCheckout(id)).invoice;
  }
  if(order.invoice?.draftAttemptedAt||order.invoice?.draftInvoiceNumber||order.invoice?.bookedInvoiceNumber)throw Error('En faktura kan være oprettet eller ændret i e-conomic. Afstem ordreferencen manuelt; der oprettes ikke en ny automatisk.');
  let customerNumber=order.invoice?.customerNumber;
  if(!customerNumber){const wanted=invoiceCustomer(order,env),field=wanted.corporateIdentificationNumber?'corporateIdentificationNumber':'email',customers=await api(collection('/customers',field,wanted[field]));
   if(!Array.isArray(customers.collection)||customers.pagination?.nextPage)throw Error('Kundeopslaget skal afstemmes manuelt.');
   const matches=customers.collection.filter(c=>String(c[field]||'').toLowerCase()===String(wanted[field]).toLowerCase()&&(wanted.corporateIdentificationNumber||c.name?.toLowerCase()===wanted.name.toLowerCase()));
   if(matches.length>1)throw Error('Flere kunder matcher i e-conomic. Afstem kunden manuelt.');
   if(matches.length){const customer=matches[0];if(customer.barred||customer.currency!=='DKK'||Number(customer.vatZone?.vatZoneNumber)!==wanted.vatZone.vatZoneNumber)throw Error('Kundens valuta, momszone eller spærring kræver manuel afklaring.');customerNumber=customer.customerNumber;}
   else{if(order.invoice?.customerAttemptedAt)throw Error('Kunden kan være oprettet. Kontrollér kunden i e-conomic før et nyt forsøg.');await saveInvoice(id,{status:'creating_customer',customerAttemptedAt:stamp()});const created=await api('/customers',{method:'POST',body:wanted});customerNumber=created.customerNumber;}
   if(!positive(customerNumber))throw Error('Kundenummeret kunne ikke bekræftes.');await saveInvoice(id,{customerNumber:Number(customerNumber)});
  }
  order=await readCheckout(id);if(!eligible(order))throw Error('Ordren har ændret status. Kontrollér den manuelt.');
  const body=economicDraft(order,customerNumber,env);await saveInvoice(id,{status:'creating_draft',draftAttemptedAt:stamp()});
  const created=await api('/invoices/drafts',{method:'POST',body});
  if(!positive(created.draftInvoiceNumber))throw Error('Kladdeoprettelsen skal kontrolleres i e-conomic.');
  await saveInvoice(id,{draftInvoiceNumber:created.draftInvoiceNumber});assertInvoiceMatches(created,order,customerNumber);
  await saveInvoice(id,{status:'draft',error:null,lastCheckedAt:stamp()});return (await readCheckout(id)).invoice;
 }catch(error){await saveInvoice(id,{status:'needs_attention',error:error.message});throw error;}
}
let busy=false;
export async function syncEconomicInvoices(options={}){
 if(busy||(options.env||process.env).SMERCH_FINANCE_ENABLED==='1'||!economicConfiguration(options.env).ready)return;busy=true;
 try{for(const order of await listCheckouts()){if(!eligible(order)||order.invoice?.status==='needs_attention'||order.invoice?.status==='booked')continue;if(order.invoice?.lastCheckedAt&&Date.now()-Date.parse(order.invoice.lastCheckedAt)<15*60_000)continue;try{await syncEconomicInvoice(order.id,options);}catch{}}}finally{busy=false;}
}
