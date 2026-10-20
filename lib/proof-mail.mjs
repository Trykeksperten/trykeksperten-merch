import {mkdir,readFile,readdir,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import nodemailer from 'nodemailer';
import {dataPath} from './data-path.mjs';
import {contactConfiguration} from './contact.mjs';
import {readOrder} from './pf-orders.mjs';
export function proofMailConfiguration(env=process.env){
 return contactConfiguration({CONTACT_SMTP_HOST:env.PROOF_SMTP_HOST||'send.one.com',CONTACT_SMTP_PORT:env.PROOF_SMTP_PORT||465,CONTACT_SMTP_SECURE:env.PROOF_SMTP_SECURE??'1',CONTACT_SMTP_USER:env.PROOF_SMTP_USER||'korrektur@smerch.dk',CONTACT_SMTP_PASSWORD:env.PROOF_SMTP_PASSWORD||'',CONTACT_TO_EMAIL:env.PROOF_SMTP_USER||'korrektur@smerch.dk'});
}
export function proofMailMessage(mail,config){
 return {from:{name:'Smerch korrektur',address:config.user},replyTo:{name:'Smerch korrektur',address:config.user},to:mail.to,subject:mail.adminTest?'[TEST] Din korrektur er klar · Smerch':mail.sentCount?'Påmindelse: Din korrektur afventer dig · Smerch':'Din korrektur er klar · Smerch',text:[mail.adminTest?'TEST – Afprøv korrekturlinket. Ingen betaling, PF-afsendelse eller produktion sættes i gang.':'',`Din korrektur til ${mail.reference} er klar.`,`Version ${mail.version}`,mail.message||'',mail.url?'Se korrekturen og vælg “Godkend til produktion” eller “Bed om ændringer”:':'',mail.url||'','Produktionen afventer din udtrykkelige godkendelse. Du skal ikke oprette en konto.',mail.url?'Linket er personligt og gælder i 30 dage.':'',`Kontakt ${config.user}, hvis du har brug for hjælp.`].filter(Boolean).join('\n\n')};
}
const directory=()=>dataPath('proof-mail');
async function save(path,value){await mkdir(directory(),{recursive:true,mode:0o700});const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,path);}
export async function queueProofMail(record){await save(dataPath('proof-mail',`${record.id}-${record.version}-${record.tokenHash}.json`),{...record,createdAt:new Date().toISOString(),sentCount:0,status:'pending'});}
let busy=false;
export async function retryProofMail({env=process.env,transport,now=Date.now(),orderIds}={}){
 const config=proofMailConfiguration(env);if(busy||(!config.ready&&!transport))return;busy=true;
 try{
  const files=await readdir(directory()).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  const sender=transport||nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},requireTLS:!config.secure});
  for(const name of files.filter(name=>name.endsWith('.json'))){
   const path=dataPath('proof-mail',name),mail=JSON.parse(await readFile(path,'utf8'));if(orderIds&&!orderIds.includes(mail.id))continue;if(['obsolete','complete'].includes(mail.status))continue;
   const order=await readOrder(mail.id).catch(()=>null),access=order?.proof?.customer;
   if(access?.tokenHash!==mail.tokenHash&&now-Date.parse(mail.createdAt)<60000)continue;
   if(!order||order.proof.version!==mail.version||access?.tokenHash!==mail.tokenHash||Date.parse(access.expiresAt)<=now||order.status!=='proof_received'){mail.status='obsolete';await save(path,mail);continue;}
   if(mail.adminTest&&mail.sentCount>=1){mail.status='complete';await save(path,mail);continue;}
   if(mail.sentCount>=3){mail.status='complete';await save(path,mail);continue;}
   if(mail.lastSentAt&&now-Date.parse(mail.lastSentAt)<48*3600000)continue;
   if(mail.lastAttemptAt&&now-Date.parse(mail.lastAttemptAt)<15*60000)continue;
   mail.lastAttemptAt=new Date(now).toISOString();await save(path,mail);
   try{await sender.sendMail(proofMailMessage(mail,config));mail.sentCount++;mail.lastSentAt=new Date(now).toISOString();mail.status='sent';delete mail.error;await save(path,mail);}catch{mail.error='Mail kunne ikke sendes. Der forsøges igen.';await save(path,mail);}
  }
 }finally{busy=false;}
}
export async function proofMailStatus(id){const files=await readdir(directory()).catch(()=>[]),records=[];for(const name of files.filter(name=>name.startsWith(id+'-')&&name.endsWith('.json'))){const {version,status,sentCount,lastSentAt,error}=JSON.parse(await readFile(dataPath('proof-mail',name),'utf8'));records.push({version,status,sentCount,lastSentAt,error});}return records;}
