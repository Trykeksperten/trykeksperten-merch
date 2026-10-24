import {mkdir,readdir,readFile,writeFile,rename,rmdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import nodemailer from 'nodemailer';
import {dataPath} from './data-path.mjs';
import {contactConfiguration} from './contact.mjs';
import {automationSettings} from './automation-settings.mjs';
import {listOrders,readOrder} from './pf-orders.mjs';
import {shipmentProblems} from './pf-shipment.mjs';
const locks=new Map();
async function locked(id,fn){const previous=locks.get(id)||Promise.resolve();const task=previous.catch(()=>{}).then(fn);locks.set(id,task);try{return await task;}finally{if(locks.get(id)===task)locks.delete(id);}}
const dir=()=>dataPath('shipment-mail');
async function withMailLock(id,fn){
 path(id);const lock=dataPath('shipment-mail',id+'.lock');await mkdir(dir(),{recursive:true,mode:0o700});
 try{await mkdir(lock,{mode:0o700});}catch(e){if(e.code==='EEXIST')throw Error('Forsendelsesmailen behandles eller kræver afstemning efter en afbrudt afsendelse.');throw e;}
 try{return await fn();}finally{await rmdir(lock);}
}

function path(id){if(!/^[a-f0-9]{64}$/.test(id))throw Error('Ugyldig mailreference.');return dataPath('shipment-mail',id+'.json');}
async function save(record){await mkdir(dir(),{recursive:true,mode:0o700});const tmp=path(record.id)+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(record),{mode:0o600});await rename(tmp,path(record.id));}
const load=async id=>JSON.parse(await readFile(path(id),'utf8'));
export async function shipmentMailStatus(orderId){let names;try{names=await readdir(dir());}catch(e){if(e.code==='ENOENT')return [];throw e;}const rows=await Promise.all(names.filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).map(n=>load(n.slice(0,-5))));return rows.filter(r=>!orderId||r.orderId===orderId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
function draft(order,delivery){const partial=!delivery.isOrderComplete;const date=new Date(delivery.shipDate).toLocaleDateString('da-DK',{timeZone:'Europe/Copenhagen'});const items=delivery.items?.length?delivery.items.map(i=>`${i.quantity} × ${order.lines.find(l=>l.sku===i.sku)?.productName||i.sku}`).join('\n'):'PF har endnu ikke angivet afsendte antal pr. varelinje.';return {to:order.shipping?.email,subject:`${partial?'En del af din ordre er afsendt':'Din ordre er afsendt'} · Smerch ${order.pfOrderNumber||order.purchaseOrderNumber}`,text:[`Hej ${order.shipping?.name||''}`,partial?'En del af din ordre er på vej. Resten følger senere.':'Din ordre er på vej.',`Ordre: ${order.pfOrderNumber||order.purchaseOrderNumber}`,items,`Afsendt: ${date}\nTransportør: ${delivery.carrier}`,...delivery.trackingDetails.map(t=>`Tracking: ${t.trackingId}\n${t.trackingURL||'Link afventer'}`),'Har du spørgsmål, kan du svare på denne mail.\nSmerch'].join('\n\n')};}
export async function reconcileShipmentMail(order){if(order.adminTest||order.isTest||order.gatewayPayload?.Header?.isTest||!order.checkoutId)return;
 for(const delivery of order.shipment?.deliveries||[]){if(!delivery.key)continue;const id=createHash('sha256').update(order.id+':'+delivery.key).digest('hex');await locked(id,()=>withMailLock(id,async()=>{let old;try{old=await load(id);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(old&&['sent','sending','uncertain'].includes(old.status))return;
 const problems=shipmentProblems(order,delivery);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.shipping?.email||''))problems.push('Kundens e-mail mangler.');
 await save({...old,id,orderId:order.id,deliveryKey:delivery.key,createdAt:old?.createdAt||new Date().toISOString(),...(!problems.length?draft(order,delivery):{to:order.shipping?.email}),status:problems.length?'blocked':old?.status==='failed'?'failed':'review',problems});}));}}
export async function sendShipmentMail(orderId,id,{env=process.env,transport,confirmUncertain=false,automatic=false,initiatedBy}={}){return locked(id,()=>withMailLock(id,async()=>{const record=await load(id);if(record.orderId!==orderId)throw Error('Mailen tilhører en anden ordre.');if(record.status==='sent')return record;if(record.status==='sending')throw Error('Afsendelsen behandles. Afstem mailkontoen før et nyt forsøg.');if(record.status==='uncertain'&&!confirmUncertain)throw Error('Afstem mailkontoen og bekræft, at mailen ikke blev sendt.');
 const order=await readOrder(orderId),delivery=order.shipment?.deliveries?.find(d=>d.key===record.deliveryKey);if(!delivery)throw Error('Forsendelsen findes ikke.');const problems=shipmentProblems(order,delivery);if(problems.length)throw Error(problems.join(' '));if(order.adminTest||order.isTest||order.gatewayPayload?.Header?.isTest||!order.checkoutId)throw Error('Testordrer sender ikke kundemails.');
 const current=draft(order,delivery);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(current.to||''))throw Error('Kundens e-mail mangler.');const settings=await automationSettings();if(automatic&&(settings.shipmentMail!=='automatic'||settings.supplierCustomerMail!=='disabled'))return record;
 const config=contactConfiguration(env);if(!transport&&!config.ready){record.status='failed';record.error='Mailforbindelsen er ikke konfigureret.';await save(record);return record;}
 Object.assign(record,current,{initiatedBy:automatic?{type:'system',name:'Smerch automatik'}:initiatedBy||null,status:'sending',attemptedAt:new Date().toISOString(),attempts:(record.attempts||0)+1});delete record.error;await save(record);
 try{const sender=transport||nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,requireTLS:!config.secure,auth:{user:config.user,pass:config.password}});const result=await sender.sendMail({from:{name:'Smerch',address:config.user},replyTo:config.user,to:record.to,subject:record.subject,text:record.text,messageId:`<shipment-${id}@smerch.dk>`,disableFileAccess:true,disableUrlAccess:true});if(!result.accepted?.length)throw Error('Mailen blev ikke bekræftet.');record.sentBy={type:'system',name:'Smerch',email:config.user};record.status='sent';record.sentAt=new Date().toISOString();}
 catch{record.status='uncertain';record.error='Leveringen er ukendt. Kontrollér mailkontoen før genforsøg; automatisk genforsøg er stoppet.';}await save(record);return record;}));}
let busy=false;
export async function processShipmentMail(options={}){if(busy)return;busy=true;try{for(const order of await listOrders())await reconcileShipmentMail(order);for(const row of await shipmentMailStatus()){if(row.status==='sending'&&Date.now()-Date.parse(row.attemptedAt)>5*60000)await locked(row.id,async()=>{const current=await load(row.id);if(current.status==='sending'){current.status='uncertain';current.error='Afsendelsen blev afbrudt. Afstem mailkontoen før genforsøg.';await save(current);}});if(row.status==='review')await sendShipmentMail(row.orderId,row.id,{...options,automatic:true});}}finally{busy=false;}}
