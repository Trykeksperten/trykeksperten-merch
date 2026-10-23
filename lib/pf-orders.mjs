import {PDFDocument} from 'pdf-lib';
import {productionPaymentActive} from './production-payment.mjs';
import {trackingEntries} from '../dist/shipment-tracking.mjs';
import {hasPersonalisation} from '../dist/purchase-flow.mjs';
import {queueProofMail} from './proof-mail.mjs';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {dataPath} from './data-path.mjs';
import {sanitizeDesignLine} from './design-validation.mjs';
import {quotePFCart,supplierPFOrderAmounts,listPFStock} from './pf-pricing.mjs';
import {buildPFOrder,submitPFOrder,gatewayConfiguration} from './pf-gateway.mjs';
import {readCheckout} from './checkout.mjs';

const directory=()=>dataPath('orders');
const proofDirectory=()=>dataPath('proofs');
const stamp=()=>new Date().toISOString();
const file=id=>{if(!/^ord-[a-f0-9-]{36}$/.test(id))throw Error('Ugyldigt ordrenummer.');return resolve(directory(),`${id}.json`);};
const safeEqual=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&timingSafeEqual(x,y);};
const orderLocks=new Map();
async function serializeOrder(id,task){const previous=orderLocks.get(id)||Promise.resolve();let release;const current=new Promise(resolve=>{release=resolve;});orderLocks.set(id,current);await previous;try{return await task();}finally{release();if(orderLocks.get(id)===current)orderLocks.delete(id);}}
export function authorized(req,secret){return Boolean(secret)&&safeEqual(req.headers.authorization,`Bearer ${secret}`);}
export function callbackAuthorized(req,env=process.env){const header=String(req.headers.authorization||''),expected=Buffer.from(`${env.PF_CALLBACK_USERNAME||''}:${env.PF_CALLBACK_PASSWORD||''}`).toString('base64');return Boolean(env.PF_CALLBACK_USERNAME&&env.PF_CALLBACK_PASSWORD)&&safeEqual(header,`Basic ${expected}`);}
export function proofInboxAuthorized(req,env=process.env){return authorized(req,env.PF_PROOF_INBOX_TOKEN);}
export function gatewayTestOrderInput(input,{env=process.env}={}){
 if(env.PF_GATEWAY_MODE!=='test')throw Error('Gateway-testordrer kan kun sendes i PF-testmiljøet.');
 if(input?.confirmation!=='TEST')throw Error('Skriv TEST for at bekræfte testordren.');
 return {lines:[{productId:'pf-38687',sku:'38687550',quantity:50,decorations:[]}],shipping:{name:input.name,company:'Smerch Gateway-test',email:input.email,phone:input.phone,address:{street:input.street,street2:'PF TEST – MÅ IKKE PRODUCERES',postalCode:input.postalCode,city:input.city,country:'DK'}}};
}
export async function readOrder(id){return JSON.parse(await readFile(file(id),'utf8'));}
async function saveOrder(order){await mkdir(directory(),{recursive:true,mode:0o700});const destination=file(order.id),temporary=`${destination}.${randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify(order,null,2),{mode:0o600});await rename(temporary,destination);return order;}
export async function listOrders(){try{return (await Promise.all((await readdir(directory())).filter(name=>/^ord-[a-f0-9-]{36}\.json$/.test(name)).map(async name=>JSON.parse(await readFile(resolve(directory(),name),'utf8'))))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}catch(error){if(error.code==='ENOENT')return [];throw error;}}

export async function prepareOrder(input,{catalog,prices,rules,stock,env=process.env}={}){
 if(!Array.isArray(input?.lines)||!input.lines.length||input.lines.length>20)throw Error('Hver PF-ordre skal indeholde 1–20 varelinjer fra samme produktionssted.');
 const lines=input.lines.map(line=>sanitizeDesignLine(catalog,line));
 if(input.checkoutId){const checkout=await readCheckout(input.checkoutId),group=checkout.fulfillment?.groups?.[input.checkoutGroupIndex];if(checkout.status!=='authorized'||!group||group.location!==input.productionLocation||JSON.stringify(lines)!==JSON.stringify(group.lineIndexes.map(index=>checkout.lines[index])))throw Error('PF-ordren matcher ikke en reserveret kundeordre.');}
 const quote=quotePFCart(catalog,lines,prices,rules),supplier=supplierPFOrderAmounts(catalog,lines,prices);
 if(quote.totalIncVat===null||quote.lines.some(line=>line.error))throw Error(quote.message||'Salgsprisen mangler.');
 const available=listPFStock(catalog,stock);
 if(!available.available||lines.some(line=>!available.items[line.sku]||available.items[line.sku].available<line.quantity))throw Error('Aktuelt PF-lager kan ikke bekræftes for denne ordre.');
 const hash=input.checkoutId&&Number.isInteger(input.checkoutGroupIndex)?createHash('sha256').update(`${input.checkoutId}:${input.checkoutGroupIndex}`).digest('hex'):null;
 const id=hash?`ord-${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`:`ord-${randomUUID()}`;
 if(input.checkoutId){try{return await readOrder(id);}catch(error){if(error.code!=='ENOENT')throw error;}}
 const createdAt=stamp(),assets=input.assets||{};
 const configuredLines=lines.map((row,index)=>({...row,supplierUnitPrice:supplier.unitPrices[index],decorations:row.decorations.map((design,designIndex)=>{
  const key=`${index}:${designIndex}`,asset=assets[key];
  if(!asset)throw Error(`Trykfiler og PF-farvekoder mangler for placering ${designIndex+1}.`);
  return {...design,pmsColors:asset.pmsColors,files:asset.files};
 })}));
 const order={id,createdAt,updatedAt:createdAt,status:'prepared',messageId:randomUUID(),purchaseOrderNumber:`SMERCH-${id.slice(4)}`,currency:'DKK',checkoutId:input.checkoutId||null,checkoutGroupIndex:Number.isInteger(input.checkoutGroupIndex)?input.checkoutGroupIndex:null,productionLocation:input.productionLocation||null,lines:configuredLines,shipping:input.shipping,quote,supplierTotal:supplier.total,events:[{at:createdAt,type:'prepared'}]};
 order.gatewayPayload=buildPFOrder(order,{senderId:env.PF_GATEWAY_SENDER_ID,communicationEmail:env.PF_COMMUNICATION_EMAIL,isTest:env.PF_GATEWAY_MODE!=='live'});
 return saveOrder(order);
}

const active=new Set();
export async function dispatchOrder(id,{env=process.env,fetchImpl=fetch}={}){
 if(active.has(id))throw Error('Ordren sendes allerede.');active.add(id);
 try{
  const order=await readOrder(id),config=gatewayConfiguration(env);
  if(order.adminTest)throw Error('Korrekturtesten må ikke sendes til PF.');
  if(order.status!=='prepared')throw Error('Ordren er allerede behandlet eller kræver manuel afstemning.');
  if(order.checkoutId){const checkout=await readCheckout(order.checkoutId);if(checkout.status!=='authorized'||!checkout.pfOrderIds?.includes(id))throw Error('Kundens betalingsreservation er ikke aktiv. PF-ordren må ikke sendes.');}
  if(!config.ready)throw Error('PF Gateway er ikke klar.');
  if(order.gatewayPayload.Header.isTest!==(config.mode==='test'))throw Error('Ordren er forberedt til et andet PF-miljø.');
  if(config.mode==='live'&&order.gatewayPayload.OrderType==='DECORATED'&&env.PF_COMMUNICATION_EMAIL_ACTIVE!=='1')throw Error('Bekræft at CommunicationEmail er en aktiv bruger på PF Store før afsendelse af varer med tryk.');
  order.status='submitting';order.updatedAt=stamp();order.events.push({at:order.updatedAt,type:'submitting'});await saveOrder(order);
  try{const result=await submitPFOrder(order.gatewayPayload,{env,fetchImpl});order.status='gateway_accepted';order.gatewayResponse=result;order.updatedAt=stamp();order.events.push({at:order.updatedAt,type:'gateway_accepted'});await saveOrder(order);return order;}
  catch(error){order.status='needs_reconciliation';order.updatedAt=stamp();order.events.push({at:order.updatedAt,type:'needs_reconciliation',message:error.message});await saveOrder(order);throw error;}
 }finally{active.delete(id);}
}

// One ASN can contain multiple orders. Group before applying so deduplication
// by messageId cannot discard the second delivery for the same order.
export async function applyPFNotificationBatch(kind,payload){
 if(kind!=='shipment')return [await applyPFNotification(kind,payload)];
 const body=payload?.ShipmentNotification,groups=new Map();
 if(!Array.isArray(body?.deliveries)||!body.deliveries.length)throw Error('PF-beskeden mangler leverancer.');
 for(const entry of body.deliveries){const ref=entry?.deliveryLocation?.customerPONumber;notificationOrderId(ref);if(!groups.has(ref))groups.set(ref,[]);groups.get(ref).push(entry);}
 // Validate order existence before any writes. Retries are safe per order.
 await Promise.all([...groups.keys()].map(ref=>readOrder(notificationOrderId(ref))));
 const orders=[];
 for(const deliveries of groups.values())orders.push(await applyPFNotification(kind,{ShipmentNotification:{...body,deliveries}}));
 return orders;
}
function notificationOrderId(reference){if(typeof reference!=='string'||!/^SMERCH-[a-f0-9-]{36}$/.test(reference))throw Error('PF-beskeden mangler et kendt ordrenummer.');return `ord-${reference.slice(7)}`;}
function confirmationReference(body){const refs=[body?.POreference,body?.reference,body?.delivery?.reference].filter(value=>value!==undefined&&value!=='');if(new Set(refs).size>1)throw Error('PF-beskeden indeholder modstridende ordrereferencer.');return refs[0];}
function trackingNumbers(rows){return (Array.isArray(rows)?rows:[]).map(row=>typeof row==='string'?row:row?.trackingId).filter(value=>typeof value==='string'&&value.trim()).map(value=>value.slice(0,500));}
export async function applyPFNotification(kind,payload){
 if(!['confirmation','status','shipment'].includes(kind))throw Error('Ukendt PF-besked.');
 const body=kind==='status'?payload?.StatusChangedNotification:kind==='shipment'?payload?.ShipmentNotification:payload;
 const deliveries=body?.deliveries?.map(entry=>entry?.deliveryLocation)||[];
 const reference=kind==='status'?(body?.poNumber||body?.pONumber):kind==='confirmation'?confirmationReference(body):deliveries[0]?.customerPONumber;
 const id=notificationOrderId(reference);
 if(kind==='shipment'&&deliveries.some(row=>row?.customerPONumber!==reference))throw Error('Brug samlet modtagelse til ASN med flere ordrer.');
 const messageId=body?.messageId||body?.messageID;
 if(typeof messageId!=='string'||!messageId.trim()||messageId.length>200)throw Error('PF-beskeden mangler messageId.');
 return serializeOrder(id,async()=>{
 const order=await readOrder(id);
 if(order.events.some(event=>event.messageId===messageId&&event.type===`pf_${kind}`))return order;
 const statusCode=String(body?.statusCode||body?.StatusCode||'').toUpperCase();
 if(kind==='status'&&!['STALLED','PROCESSING','PARTIAL SHIPPED','SHIPPED','COMPLETED','CANCELLED'].includes(statusCode))throw Error('Ukendt PF-ordrestatus.');
 if(kind==='confirmation'){
  if(!body.orderNumber)throw Error('PF-bestillingsnummer mangler.');
  order.pfOrderNumber=body.orderNumber;
  if(['prepared','gateway_accepted','submitting'].includes(order.status))order.status=hasPersonalisation(order.lines)?'awaiting_proof':'confirmed';
 }
 const unapproved=order.checkoutId&&hasPersonalisation(order.lines)&&!order.proof?.approvalReference;
 if(kind==='status'){
  order.pfStatus=statusCode;order.pfStatusInformation=String(body.statusInformation||'').slice(0,2000);
  if(Number.isFinite(Date.parse(body.expectedShipDate)))order.expectedShipDate=body.expectedShipDate;
  if(statusCode==='CANCELLED')order.status='cancelled';
  else if(statusCode==='STALLED'||unapproved)order.status='needs_attention';
  else if(!['cancelled','shipped','partially_shipped','proof_received','awaiting_proof','revision_requested','approval_pending_pf'].includes(order.status))order.status='processing';
 }
 if(kind==='shipment'){
  const records=deliveries.map(delivery=>({carrier:delivery.carrier,shipDate:delivery.shipDate,tracking:trackingNumbers(delivery.trackAndTrace),trackingDetails:trackingEntries(delivery.trackAndTrace),isOrderComplete:delivery.isOrderComplete===true,reference:delivery.reference||null}));
  const history=[...(order.shipment?.deliveries||[]),...records];
  const complete=history.some(row=>row.isOrderComplete===true);
  order.shipment={carrier:[...new Set(history.map(row=>row.carrier).filter(Boolean))].join(', '),shipDate:history.map(row=>row.shipDate).filter(value=>Number.isFinite(Date.parse(value))).sort((a,b)=>Date.parse(b)-Date.parse(a))[0],tracking:[...new Set(history.flatMap(row=>row.tracking))],trackingDetails:[...new Map(history.flatMap(row=>row.trackingDetails||[]).map(row=>[row.trackingId,row])).values()],isOrderComplete:complete,deliveries:history};
  order.status=order.status==='cancelled'||unapproved?'needs_attention':complete?'shipped':'partially_shipped';
 }
 order.updatedAt=stamp();order.events.push({at:order.updatedAt,type:`pf_${kind}`,messageId});return saveOrder(order);
 });
}

// PF v2.2.2 has no published proof approval endpoint. Recording this event
// never claims production was released; that requires PF's own confirmation.
const formats={'application/pdf':{ext:'pdf',magic:b=>b.subarray(0,5).toString()==='%PDF-'},'image/png':{ext:'png',magic:b=>b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))},'image/jpeg':{ext:'jpg',magic:b=>b[0]===255&&b[1]===216&&b[2]===255}};
function proofFile(id,hash,mimeType){return resolve(proofDirectory(),id,`${hash}.${formats[mimeType].ext}`);}
export async function readProofFile(id,version){const order=await readOrder(id),proof=(order.proofs||[]).find(row=>row.version===Number(version));if(!proof?.hash||!formats[proof.mimeType])throw Error('Korrekturfiler findes ikke.');return {data:await readFile(proofFile(id,proof.hash,proof.mimeType)),mimeType:proof.mimeType};}
export async function recordProof(id,input={}){return serializeOrder(id,()=>recordProofLocked(id,input));}
async function recordProofLocked(id,{proofReference,proofUrl,contentBase64,mimeType,messageId,source='admin',purchaseOrderNumber}={}){
 const order=await readOrder(id);if(purchaseOrderNumber&&purchaseOrderNumber!==order.purchaseOrderNumber)throw Error('Korrekturen matcher ikke ordren.');
 if(!['gateway_accepted','awaiting_proof','proof_received','revision_requested','approval_pending_pf','approval_recorded'].includes(order.status))throw Error('Ordren afventer ikke korrektur.');
 if(typeof proofReference!=='string'||!proofReference.trim())throw Error('PF-korrekturens reference kræves.');
 if(messageId&&order.events.some(event=>event.type==='proof_received'&&event.messageId===messageId))return order;
 let hash,bytes,url;
 if(contentBase64!==undefined){if(!formats[mimeType]||typeof contentBase64!=='string'||contentBase64.length>14*1024*1024||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(contentBase64))throw Error('Kun PDF, PNG eller JPEG op til 10 MB kan modtages.');bytes=Buffer.from(contentBase64,'base64');if(!bytes.length||bytes.length>10*1024*1024||!formats[mimeType].magic(bytes))throw Error('Korrekturfilens indhold eller format er ugyldigt.');if(mimeType==='application/pdf'){try{const pdf=await PDFDocument.load(bytes,{throwOnInvalidObject:true});if(!pdf.getPageCount())throw Error('No pages');}catch{throw Error('PDF-korrekturen kan ikke læses. Upload en gyldig PDF med mindst én side.');}}hash=createHash('sha256').update(bytes).digest('hex');}
 else {const parsed=new URL(proofUrl);if(parsed.protocol!=='https:'||!parsed.hostname||parsed.username||parsed.password)throw Error('Et gyldigt HTTPS-link kræves.');url=parsed.href;hash=createHash('sha256').update(url).digest('hex');}
 if(order.proof?.hash===hash)return order;
 const version=(order.proofs?.at(-1)?.version||0)+1,at=stamp();
 if(bytes){await mkdir(resolve(proofDirectory(),id),{recursive:true,mode:0o700});await writeFile(proofFile(id,hash,mimeType),bytes,{flag:'wx',mode:0o600}).catch(error=>{if(error.code!=='EEXIST')throw error;});}
 const proof={version,reference:proofReference.trim().slice(0,150),hash,mimeType:bytes?mimeType:null,url,source:source==='inbox'?'inbox':'admin',receivedAt:at};
 order.proofs=[...(order.proofs||[]),proof];order.proof=proof;order.decision=null;order.status='proof_received';order.updatedAt=at;order.events.push({at,type:'proof_received',version,messageId:messageId?String(messageId).slice(0,200):undefined});return saveOrder(order);
}

export async function decideProof(id,input={}){return serializeOrder(id,()=>decideProofLocked(id,input));}
async function decideProofLocked(id,{version,decision,comment,customerToken,attachments=[]}={}){
 const order=await readOrder(id),proof=order.proof;
 if(order.status!=='proof_received'||!proof||Number(version)!==proof.version)throw Error('Vælg den seneste korrekturversion før beslutningen.');
 if(customerToken)validateCustomerAccess(order,customerToken);
 if(order.checkoutId&&decision==='approve'&&!customerToken)throw Error('Kunden skal selv godkende korrekturen via sit personlige link.');
 if(!['approve','reject'].includes(decision))throw Error('Vælg godkend eller bed om ændring.');
 if(order.checkoutId&&decision==='approve'&&!['authorized','paid'].includes((await readCheckout(order.checkoutId)).status))throw Error('Kundens betaling er ikke aktiv. Korrekturen kan ikke godkendes.');
 if(decision==='reject'&&(!comment||!String(comment).trim()))throw Error('Skriv hvad PF skal rette.');
 const feedback=customerToken?await saveFeedback(id,attachments):[];
 const at=stamp();order.decision={actor:customerToken?'customer':'staff',attachments:feedback,proofHash:proof.hash,version,decision,comment:String(comment||'').trim().slice(0,2000),at,delivery:'pending_manual_pf'};proof.decision=order.decision;order.proofs=order.proofs.map(row=>row.version===proof.version?proof:row);order.status=decision==='approve'?'approval_pending_pf':'revision_requested';order.updatedAt=at;order.events.push({at,type:decision==='approve'?(customerToken?'customer_approved':'smerch_approved'):'revision_requested',version});
 if(customerToken&&order.checkoutId){const checkout=await readCheckout(order.checkoutId);await queueProofMail({kind:'receipt',id,version:proof.version,tokenHash:'receipt',decision,decisionAt:at,comment:order.decision.comment,to:checkout.shipping.email,reference:order.purchaseOrderNumber,adminTest:order.adminTest===true});
  await queueProofMail({kind:'staff_decision',id,version:proof.version,tokenHash:'staff-decision',decision,decisionAt:at,comment:order.decision.comment,to:'korrektur@smerch.dk',customerEmail:checkout.shipping.email,reference:order.purchaseOrderNumber,pfOrderNumber:order.pfOrderNumber,proofReference:proof.reference,attachmentCount:feedback.length,adminTest:order.adminTest===true});
 }
 return saveOrder(order);
}

export async function recordApprovalDelivery(id,{channel,reference}={}){return serializeOrder(id,async()=>{
 const order=await readOrder(id);if(order.adminTest)throw Error('Korrekturtesten må ikke frigives til PF.');const approved=order.decision?.decision==='approve';if(!['approval_pending_pf','revision_requested'].includes(order.status)||order.decision?.version!==order.proof?.version||(approved&&order.status!=='approval_pending_pf')||(!approved&&order.status!=='revision_requested'))throw Error('Kun den seneste beslutning må sendes til PF.');
 if(approved&&order.checkoutId&&!productionPaymentActive(await readCheckout(order.checkoutId)))throw Error('En gyldig betalingsreservation kræves før godkendelsen sendes til PF.');
 if(typeof channel!=='string'||!['PF Store','E-mail','Anden aftalt PF-kanal'].includes(channel)||typeof reference!=='string'||!reference.trim())throw Error('Angiv aftalt PF-kanal og en sporbar afsendelsesreference.');
 const at=stamp();order.decision.delivery={channel,reference:reference.trim().slice(0,200),at};order.updatedAt=at;order.events.push({at,type:approved?'approval_sent_to_pf':'revision_sent_to_pf',version:order.proof.version,channel,reference:order.decision.delivery.reference});return saveOrder(order);
 });}

export async function recordExternalApproval(id,input={}){return serializeOrder(id,()=>recordExternalApprovalLocked(id,input));}
async function recordExternalApprovalLocked(id,{pfApprovalReference}){
 const order=await readOrder(id);if(order.adminTest)throw Error('Korrekturtesten må ikke frigives til PF.');
 if(order.status!=='approval_pending_pf'||order.decision?.version!==order.proof?.version||order.decision?.decision!=='approve')throw Error('Den aktuelle korrektur skal godkendes hos Smerch før PF-bekræftelsen registreres.');
 if(order.checkoutId&&!productionPaymentActive(await readCheckout(order.checkoutId)))throw Error('En gyldig betalingsreservation kræves før produktionen frigives hos PF.');
 if(order.checkoutId&&!order.decision.delivery?.reference)throw Error('Godkendelsen skal først sendes til PF via den aftalte kanal og registreres.');
 if(typeof pfApprovalReference!=='string'||!pfApprovalReference.trim())throw Error('Reference til godkendelsen hos PF kræves.');
 order.proof.approvalReference=pfApprovalReference.trim().slice(0,150);
 order.proof.approvedAt=stamp();order.status='approval_recorded';order.updatedAt=order.proof.approvedAt;
 order.events.push({at:order.updatedAt,type:'external_approval_recorded'});return saveOrder(order);
}

function validateCustomerAccess(order,token,now=Date.now()){
 const access=order.proof?.customer;
 if(typeof token!=='string'||!/^([a-f0-9]{64})$/.test(token)||!access||Date.parse(access.expiresAt)<=now||!safeEqual(createHash('sha256').update(token).digest('hex'),access.tokenHash))throw Error('Linket er ugyldigt eller udløbet. Bed Smerch om et nyt link.');
}
export async function publishCustomerProof(id,{version,message=''}={}, {env=process.env}={}){return serializeOrder(id,async()=>{
 const order=await readOrder(id);
 if(order.status!=='proof_received'||Number(version)!==order.proof?.version)throw Error('Vælg den seneste korrekturversion.');
 if(!order.checkoutId||!order.proof.mimeType)throw Error('En kundeordre og en gemt PDF- eller billedfil kræves. Upload korrekturfilen først.');
 const checkout=await readCheckout(order.checkoutId);
 if(!['authorized','paid','authorization_expired'].includes(checkout.status))throw Error('Ordren kan ikke sendes til kundegodkendelse.');
 const base=new URL(env.SMERCH_CUSTOMER_BASE_URL||'https://smerch.dk');
 if(base.protocol!=='https:'||base.username||base.password)throw Error('Kundesidens adresse skal være HTTPS.');
 const token=randomBytes(32).toString('hex'),tokenHash=createHash('sha256').update(token).digest('hex'),publishedAt=stamp(),expiresAt=new Date(Date.now()+30*86400000).toISOString();
 const url=new URL('/korrektur',base);url.hash=new URLSearchParams({order:id,token}).toString();
 const note=String(message).trim().slice(0,2000);
 await queueProofMail({adminTest:order.adminTest===true,id,version:order.proof.version,tokenHash,url:url.href,to:checkout.shipping.email,reference:order.purchaseOrderNumber,message:note});
 order.proof.customer={tokenHash,publishedAt,expiresAt,message:note};
 order.proofs=order.proofs.map(proof=>proof.version===order.proof.version?order.proof:proof);
 order.events.push({at:publishedAt,type:'customer_proof_published',version:order.proof.version});order.updatedAt=publishedAt;await saveOrder(order);
 return {url,version:order.proof.version,expiresAt};
});}
export async function customerProof(id,token){
 const order=await readOrder(id);validateCustomerAccess(order,token);
 const checkout=await readCheckout(order.checkoutId);
 return {reference:order.purchaseOrderNumber,version:order.proof.version,mimeType:order.proof.mimeType,message:order.proof.customer.message,status:order.status,paymentActive:['authorized','paid'].includes(checkout.status),decision:order.decision?{decision:order.decision.decision,comment:order.decision.comment,at:order.decision.at}:null,lines:order.lines.map(line=>({quantity:line.quantity,name:checkout.productNames?.[line.productId]||checkout.lines.find(item=>item.productId===line.productId&&item.sku===line.sku)?.productName||line.productId,sku:line.sku,decorations:line.decorations.map(item=>({position:item.position,width:item.width,height:item.height,colors:item.colors}))}))};
}
export async function customerProofFile(id,token){return serializeOrder(id,async()=>{const order=await readOrder(id);validateCustomerAccess(order,token);return readProofFile(id,order.proof.version);});}
async function saveFeedback(id,attachments){
 if(!Array.isArray(attachments)||attachments.length>3)throw Error('Du kan vedhæfte højst 3 filer.');
 const files=attachments.map(input=>{if(!formats[input?.mimeType]||typeof input.contentBase64!=='string'||input.contentBase64.length>7*1024*1024||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.contentBase64))throw Error('Brug PDF, PNG eller JPG, højst 5 MB pr. fil.');const bytes=Buffer.from(input.contentBase64,'base64');if(!bytes.length||bytes.length>5*1024*1024||!formats[input.mimeType].magic(bytes))throw Error('Filens indhold eller størrelse er ugyldig.');return {bytes,mimeType:input.mimeType,name:String(input.name||'Vedhæftning').replace(/[\r\n\x00-\x1f]/g,'').slice(0,150),hash:createHash('sha256').update(bytes).digest('hex')};});
 for(const file of files){await mkdir(resolve(proofDirectory(),id),{recursive:true,mode:0o700});await writeFile(proofFile(id,file.hash,file.mimeType),file.bytes,{mode:0o600});}
 return files.map(({bytes,...file})=>file);
}
export async function readFeedbackFile(id,hash){const order=await readOrder(id),attachment=(order.proofs||[]).flatMap(proof=>proof.decision?.attachments||[]).find(item=>item.hash===hash);if(!attachment)throw Error('Vedhæftningen findes ikke.');return {data:await readFile(proofFile(id,hash,attachment.mimeType)),mimeType:attachment.mimeType};}
