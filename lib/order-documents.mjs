import {accountantEmail} from './accounting-contact.mjs';
// Staff-only document snapshots. Never creates invoices, payments or supplier orders.
import {readFile,writeFile,mkdir,rename,readdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {dataPath} from './data-path.mjs';
import {renderOrderDocument} from './order-document-pdf.mjs';
import {trackingEntries} from '../dist/shipment-tracking.mjs';
export const documentTitles={confirmation:'Ordrebekræftelse',basis:'Fakturagrundlag',shipment:'Forsendelsesbekræftelse',receipt:'Kvittering'};
const defaults={name:'Smerch',legalName:'Trykeksperten ApS',address:'Raffinaderivej 20\n2300 København S\nDanmark',cvr:'44015773',email:'hello@smerch.dk',phone:'+45 27 82 22 77',paymentTerms:'',accountantNotes:'',accountantEmail:accountantEmail()};
const text=(value,max=2000)=>String(value??'').trim().slice(0,max);
export async function companySettings(){
 let saved={};try{saved=JSON.parse(await readFile(dataPath('document-company.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 return {...defaults,...saved,address:String(saved.address||defaults.address).replace(/^Raffinaderivej 10\s*e(?=\s|,|$)/i,'Raffinaderivej 20'),name:'Smerch',accountantEmail:saved.accountantEmail?.trim()||accountantEmail()};
}
export async function saveCompanySettings(input){const value=Object.fromEntries(Object.keys(defaults).map(k=>[k,k==='name'?'Smerch':text(input[k])]));await mkdir(dataPath(),{recursive:true});const temporary=dataPath('document-company-'+randomUUID()+'.tmp');await writeFile(temporary,JSON.stringify(value),{mode:0o600});await rename(temporary,dataPath('document-company.json'));return value;}
const address=s=>typeof s==='string'?s:s?[s.street,s.street2,s.deliveryComment,[s.postalCode,s.city].filter(Boolean).join(' '),s.country].filter(Boolean).join('\n'):'';
const date=value=>{if(!value||Number.isNaN(Date.parse(value)))return '';if(/^\d{4}-\d{2}-\d{2}$/.test(value))return new Date(value).toISOString().slice(0,10);const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Copenhagen',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');};
const cents=value=>Number.isSafeInteger(value)&&value>=0?value:null;
export function documentEligibility(order,checkout,type){
 if(!documentTitles[type])return 'Ukendt dokumenttype.';
 if(order.adminTest||order.isTest||order.gatewayPayload?.Header?.isTest||checkout?.adminTest||checkout?.adminLiveTest||checkout?.paymentMode==='test')return 'Testordrer kan ikke bruges til bogføring eller kundekvitteringer.';
 if(type!=='shipment'&&checkout?.quote?.currency&&checkout.quote.currency!=='DKK')return 'Dokumentet understøtter kun priser i DKK.';
 if(type!=='shipment'&&!checkout)return 'Ordren mangler et kundecheckout med salgspriser.';
 if(type==='receipt'&&(checkout.status!=='paid'||!checkout.paidAt||Number.isNaN(Date.parse(checkout.paidAt))))return 'Kvittering kræver registreret betaling og betalingsdato. En reservation er ikke en betaling.';
 if(type==='shipment'&&!['shipped','partially_shipped'].includes(order.status))return 'Forsendelsesbekræftelse kræver registreret afsendelse.';
 return '';
}
function fingerprint(order,checkout){return createHash('sha256').update(JSON.stringify({order,checkout})).digest('hex');}
export function documentSeed(order,checkout,company,type,shipmentKey){
 const reason=documentEligibility(order,checkout,type);if(reason)throw Error(reason);
 const shipping=checkout?.shipping||order.shipping||{},billing=checkout?.billing||{};
 const shipment=type==='shipment'?(order.shipment?.deliveries?.find(d=>d.key===shipmentKey)||order.shipment?.deliveries?.at(-1)||order.shipment):null;
 const source=type==='shipment'?order.lines:checkout.lines;
 const lines=(source||[]).map((line,index)=>{const quote=type==='shipment'?null:checkout.quote?.lines?.[index];const enriched=order.lines?.find(l=>l.sku===line.sku);return {description:checkout?.productNames?.[line.productId]||line.productName||enriched?.productName||'',variant:[line.sku,line.color||enriched?.color,line.size||enriched?.size,...(line.decorations||[]).map(d=>[d.method,d.position,(d.pmsColors||[]).join(', ')].filter(Boolean).join(' · '))].filter(Boolean).join(' · '),quantity:type==='shipment'?(shipment?.items?.length?shipment.items.filter(i=>i.sku===line.sku).reduce((n,i)=>n+i.quantity,0):order.status==='partially_shipped'||order.shipment?.deliveries?.length>1?null:line.quantity):line.quantity,maxQuantity:line.quantity,net:cents(quote?.net),vat:cents(quote?.vat),discount:''};});
 return {type,shipmentKey:shipment?.key||null,reference:checkout?.id||order.purchaseOrderNumber||order.id,date:date(checkout?.createdAt||order.createdAt),company:{...company},customer:{name:(type==='shipment'?(order.shipping?.company||order.shipping?.name):billing.company||shipping.company||shipping.name)||'',contact:(type==='shipment'?order.shipping?.name:shipping.name)||'',address:address(billing.address||billing),email:(type==='shipment'?order.shipping?.email:billing.email||shipping.email)||'',cvr:billing.cvr||'',ean:billing.ean||'',reference:billing.reference||''},deliveryAddress:address(order.shipping||shipping),lines,freight:cents(checkout?.freightExVat),vat:cents(checkout?.totalIncVat!==undefined&&checkout?.quote?.net!==undefined&&checkout?.freightExVat!==undefined?checkout.totalIncVat-checkout.quote.net-checkout.freightExVat:null),paymentTerms:company.paymentTerms,notes:type==='basis'?company.accountantNotes:'',accountantEmail:accountantEmail(),shipDate:date(shipment?.shipDate),carrier:shipment?.carrier||'',tracking:trackingEntries(shipment?.trackingDetails?.length?shipment.trackingDetails:shipment?.tracking).map(t=>[t.trackingId,t.trackingURL].filter(Boolean).join(' ')).join('\n'),paidAt:checkout?.paidAt||'',paymentStatus:checkout?.status==='paid'?'Betalt':checkout?.status==='authorized'?'Reserveret – ikke hævet':'Ikke registreret betalt',originalTotal:cents(checkout?.totalIncVat),fingerprint:fingerprint(order,checkout)};
}
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&date(s)===s;
export function reviewDocument(order,checkout,company,input){
 const seed=documentSeed(order,checkout,company,input.type,input.shipmentKey);
 if(input.fingerprint!==seed.fingerprint)throw Error('Ordren er ændret. Luk og indlæs dokumentet igen.');
 const d={...seed,company:{},customer:{},lines:[]},missing=[];
 for(const key of Object.keys(defaults))d.company[key]=key==='name'?'Smerch':text(input.company?.[key]);
 for(const key of Object.keys(seed.customer))d.customer[key]=text(input.customer?.[key]);
 for(const key of ['paymentTerms','notes','carrier','tracking','deliveryAddress'])d[key]=text(input[key],4000);
 d.date=text(input.date,10);d.shipDate=text(input.shipDate,10);
 for(const key of ['legalName','address','cvr','email','phone'])if(!d.company[key])missing.push('Afsender: '+({legalName:'virksomhedsnavn',address:'adresse',cvr:'CVR',email:'e-mail',phone:'telefon'}[key]));
 if(!d.customer.name)missing.push('Kundenavn');
 if(!validDate(d.date))missing.push('Gyldig ordredato');
 if(d.type==='shipment'){if(!d.deliveryAddress)missing.push('Leveringsadresse');if(!validDate(d.shipDate))missing.push('Afsendelsesdato');}
 else {if(!d.customer.address)missing.push('Faktureringsadresse');if(!d.paymentTerms&&d.type==='basis')missing.push('Betalingsbetingelser');}
 if(!Array.isArray(input.lines)||input.lines.length!==seed.lines.length||!input.lines.length)throw Error('Varelinjerne skal svare til ordren.');
 d.lines=input.lines.map((line,i)=>{const original=seed.lines[i],row={...original,description:text(line.description),variant:text(line.variant),quantity:Number(line.quantity),net:line.net===null||line.net===''?null:cents(Number(line.net)),discount:text(line.discount,200)};
 if(!row.description)missing.push(`Vare ${i+1}: beskrivelse`);
 if(!Number.isSafeInteger(row.quantity)||row.quantity<0||(d.type!=='shipment'&&row.quantity===0)||(d.type==='shipment'&&row.quantity>original.maxQuantity))missing.push(`Vare ${i+1}: gyldigt antal`);
 if(d.type!=='shipment'&&row.net===null)missing.push(`Vare ${i+1}: linjetotal ekskl. moms`);
 return row;});
 if(d.type==='shipment'&&!d.lines.some(l=>l.quantity>0))missing.push('Mindst én afsendt vare');
 d.freight=input.freight===null||input.freight===''?null:cents(Number(input.freight));d.vat=input.vat===null||input.vat===''?null:cents(Number(input.vat));
 d.net=d.lines.reduce((sum,l)=>sum+(l.net||0),0)+(d.freight||0);d.total=d.net+(d.vat||0);
 if(d.type!=='shipment'){if(d.freight===null)missing.push('Fragt ekskl. moms');if(d.vat===null)missing.push('Moms');if(!Number.isSafeInteger(d.total))missing.push('Gyldigt samlet beløb');}
 if(d.type==='receipt'&&(d.total!==seed.originalTotal||d.freight!==seed.freight||d.vat!==seed.vat||d.lines.some((l,i)=>l.net!==seed.lines[i].net||l.quantity!==seed.lines[i].quantity)))throw Error('Kvitteringens beløb og antal skal svare til den registrerede betaling.');
 d.missing=missing;d.adjusted=d.type==='basis'&&(d.total!==seed.originalTotal||d.lines.some((l,i)=>l.net!==seed.lines[i].net||l.quantity!==seed.lines[i].quantity));
 if(d.adjusted&&!d.notes)missing.push('Bemærkning til bogholderen om ændrede beløb eller antal');
 return d;
}
function file(id){if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Ugyldigt dokument.');return dataPath('order-documents',id+'.json');}
async function createOrderDocumentLocked(order,checkout,company,input){const d=reviewDocument(order,checkout,company,input);if(d.missing.length)throw Error('Udfyld: '+d.missing.join(', '));const history=await listOrderDocuments(order.id),version=history.filter(r=>r.type===d.type).length+1;const pdf=await renderOrderDocument(d);const record={id:randomUUID(),version,requestId:input.requestId||null,requestHash:createHash('sha256').update(JSON.stringify(input)).digest('hex'),orderId:order.id,createdAt:new Date().toISOString(),document:d,pdf:Buffer.from(pdf).toString('base64')};await mkdir(dataPath('order-documents'),{recursive:true,mode:0o700});await writeFile(file(record.id),JSON.stringify(record),{mode:0o600});return {id:record.id,version:record.version,type:d.type,title:documentTitles[d.type],createdAt:record.createdAt};}
export async function readOrderDocument(orderId,id){const record=JSON.parse(await readFile(file(id),'utf8'));if(record.orderId!==orderId)throw Error('Dokumentet tilhører en anden ordre.');return record;}

export async function listOrderDocuments(orderId){let names;try{names=await readdir(dataPath('order-documents'));}catch(e){if(e.code==='ENOENT')return [];throw e;}const rows=await Promise.all(names.filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).map(async name=>{const r=JSON.parse(await readFile(dataPath('order-documents',name),'utf8'));return r.orderId===orderId?{id:r.id,type:r.document.type,version:r.version||null,title:documentTitles[r.document.type],createdAt:r.createdAt}:null;}));return rows.filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}

const documentLocks=new Map();
export async function createOrderDocument(order,checkout,company,input){
 const previous=documentLocks.get(order.id)||Promise.resolve(),task=previous.catch(()=>{}).then(async()=>{
 if(input.requestId&&!/^[a-f0-9-]{36}$/.test(input.requestId))throw Error('Ugyldig dokumentreference.');
 if(input.requestId)for(const row of await listOrderDocuments(order.id)){const old=await readOrderDocument(order.id,row.id);if(old.requestId===input.requestId){if(old.requestHash!==createHash('sha256').update(JSON.stringify(input)).digest('hex'))throw Error('Dokumentrettelser kræver en ny dokumentreference.');return {...row};}}
 return createOrderDocumentLocked(order,checkout,company,input);
 });documentLocks.set(order.id,task);try{return await task;}finally{if(documentLocks.get(order.id)===task)documentLocks.delete(order.id);}
}
