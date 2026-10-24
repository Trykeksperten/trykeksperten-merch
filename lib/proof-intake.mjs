// Normalized, authenticated relay input. This is not a PF Gateway e-proof API.
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile,rename,rmdir} from 'node:fs/promises';
import {dataPath} from './data-path.mjs';
import {readOrder,recordProof,publishCustomerProof} from './pf-orders.mjs';
import {readCheckout} from './checkout.mjs';
import {automationSettings} from './automation-settings.mjs';
const directory=()=>dataPath('proof-intake');
const path=key=>dataPath('proof-intake',key+'.json');
const email=value=>typeof value==='string'&&value.length<=254&&/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value);
async function save(record){const tmp=path(record.key)+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(record),{mode:0o600});await rename(tmp,path(record.key));}
export async function proofIntakeStatus(orderId){const rows=[];for(const name of await readdir(directory()).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){if(!/^[a-f0-9]{64}\.json$/.test(name))continue;const {input,digest,...row}=JSON.parse(await readFile(dataPath('proof-intake',name),'utf8'));if(!orderId||row.orderId===orderId)rows.push(row);}return rows.sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt));}
export async function receiveProof(input,{env=process.env,mailbox=false,allowAutomatic=true}={}){
 if(typeof input?.messageId!=='string'||!input.messageId.trim()||input.messageId.length>200)throw Error('Et entydigt besked-id på højst 200 tegn kræves.');
 const key=createHash('sha256').update(input.messageId).digest('hex');
 await mkdir(directory(),{recursive:true,mode:0o700});const lock=dataPath('proof-intake',key+'.lock');
 try{await mkdir(lock,{mode:0o700});}catch(e){if(e.code==='EEXIST')throw Error('Korrekturimport behandles eller kræver afstemning efter genstart.');throw e;}
 try{
  const digest=createHash('sha256').update(JSON.stringify([input.purchaseOrderNumber,input.pfOrderNumber,input.proofReference,input.mimeType,input.contentBase64,input.supplierMessage||'',input.senderVerified])).digest('hex');
  let old;try{old=JSON.parse(await readFile(path(key),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(old&&(old.conflict||old.digest!==digest)){old.conflict=true;old.error='Samme besked-id har ændret indhold. Gennemgå indbakken manuelt.';await save(old);throw Error(old.error);}
  if(old&&['published','review','reviewed','obsolete'].includes(old.status))return {...old,input:undefined,digest:undefined,duplicate:true};
  const record={key,messageId:input.messageId,digest,input,receivedAt:old?.receivedAt||new Date().toISOString(),status:'processing'};
  await save(record);
  try{
   if(!/^SMERCH-[a-f0-9-]{36}$/.test(input.purchaseOrderNumber||''))throw Error('Ordreferencen mangler eller er usikker.');
   const order=await readOrder('ord-'+input.purchaseOrderNumber.slice(7));record.orderId=order.id;
   if(order.purchaseOrderNumber!==input.purchaseOrderNumber)throw Error('Ordreferencerne stemmer ikke overens.');
   if(input.pfOrderNumber!==undefined&&String(order.pfOrderNumber)!==String(input.pfOrderNumber))throw Error('PF-ordrenummeret stemmer ikke overens.');
   if(input.senderVerified!==true)throw Error('PF-afsenderen er ikke verificeret af mailrelæet.');
   if(!order.checkoutId)throw Error('Korrekturen mangler en tilknyttet kundeordre.');
   const checkout=await readCheckout(order.checkoutId);
   if(!checkout.pfOrderIds?.includes(order.id))throw Error('Kundeordren bekræfter ikke PF-tilknytningen.');
   if(!email(checkout.shipping?.email))throw Error('Kundens e-mailadresse mangler eller er ugyldig.');
   if(order.shipping?.email&&order.shipping.email.trim().toLowerCase()!==checkout.shipping.email.trim().toLowerCase())throw Error('Kundeoplysningerne er modstridende.');
   if(!input.contentBase64)throw Error('Selve korrekturfilen mangler. Eksterne links kræver manuel gennemgang.');
   if(mailbox){
    const incomingHash=createHash('sha256').update(Buffer.from(input.contentBase64,'base64')).digest('hex');
    const known=(order.proofs||[]).find(proof=>proof.hash===incomingHash);
    if(known){record.status='obsolete';record.version=known.version;await save(record);const {input:privateInput,digest:privateDigest,...view}=record;return {...view,duplicate:true};}
    const issued=Date.parse(input.supplierIssuedAt),previous=Date.parse(order.proof?.supplierIssuedAt||order.proof?.receivedAt);
    if(!Number.isFinite(issued)||issued>Date.now()+5*60000||(Number.isFinite(previous)&&issued<=previous))throw Error('Korrekturens rækkefølge er usikker. Gennemgå mailen manuelt.');
   }
   const current=await recordProof(order.id,{...input,source:'inbox'});record.version=current.proof?.version;
   const hash=createHash('sha256').update(Buffer.from(input.contentBase64,'base64')).digest('hex');
   // A delayed duplicate may refer to an older proof. Never publish the newer proof on its behalf.
   if(current.proof?.hash!==hash||current.proof?.reference!==input.proofReference.trim().slice(0,150)||(current.proof?.supplierMessage||'')!==String(input.supplierMessage||'').trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').slice(0,2000)){record.status='obsolete';}
   else if(allowAutomatic&&(await automationSettings()).proofPublication==='automatic'){
    const result=await publishCustomerProof(order.id,{version:current.proof.version,automatic:true},{env});record.version=result.version;record.status='published';
   }else record.status='review';
  }catch(error){record.status='blocked';record.error=error.message;}
  await save(record);const {input:privateInput,digest:privateDigest,...view}=record;return view;
 }finally{await rmdir(lock);}
}

export async function reviewProofIntake(key,{note}={}){
 if(!/^[a-f0-9]{64}$/.test(key)||typeof note!=='string'||!note.trim()||note.length>2000)throw Error('Angiv en gyldig reference og en kort behandlingsnote.');
 const lock=dataPath('proof-intake',key+'.lock');
 try{await mkdir(lock,{mode:0o700});}catch(e){if(e.code==='EEXIST')throw Error('Importen behandles eller skal afstemmes efter genstart.');throw e;}
 try{const record=JSON.parse(await readFile(path(key),'utf8'));record.reviewedAt=new Date().toISOString();record.reviewNote=note.trim();record.status='reviewed';await save(record);return {reviewed:true};}finally{await rmdir(lock);}
}
