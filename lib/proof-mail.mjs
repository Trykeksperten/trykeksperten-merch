import {readFileSync} from 'node:fs';
import {proofInvitationHTML,proofInvitationText} from './proof-mail-template.mjs';
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
 if(mail.kind==='staff_decision'){
  const approved=mail.decision==='approve';
  return {from:{name:'Smerch korrektur',address:config.user},replyTo:mail.customerEmail||config.user,to:'korrektur@smerch.dk',subject:(mail.adminTest?'[TEST] ':'')+(approved?'Kunden har godkendt korrekturen':'Kunden ønsker ændringer')+' · '+(mail.pfOrderNumber||mail.reference),text:[
   mail.adminTest?'TEST – Ingen betaling eller produktion sættes i gang.':'',
   approved?'Kunden har godkendt korrekturen. Send godkendelsen videre til PF via den aftalte kanal.':'Kunden ønsker ændringer. Gennemgå svaret og indhent en ny korrektur fra PF.',
   `Smerch-reference: ${mail.reference}`,mail.pfOrderNumber?`PF-ordre: ${mail.pfOrderNumber}`:'',
   `Korrektur: ${mail.proofReference} · version ${mail.version}`,`Kundens svar registreret: ${mail.decisionAt}`,
   mail.customerEmail?`Kunde: ${mail.customerEmail}`:'',mail.comment?`Kundens kommentar: ${mail.comment}`:'',
   mail.attachmentCount?`Kunden har vedhæftet ${mail.attachmentCount} bilag. Se dem på ordren.`:'',
   'Åbn ordren (medarbejderlogin kræves):',`https://smerch.dk/admin/pf-orders#order=${encodeURIComponent(mail.id)}`,
   'Kontrollér den aktuelle korrekturversion og status på ordren før næste handling.',
   'Denne mail sender ikke godkendelsen til PF. Kundens godkendelse udløser ingen hævning; beløbet må først hæves ved afsendelse.'
  ].filter(Boolean).join('\n\n')};
 }

 if(mail.kind==='receipt'){
  const approved=mail.decision==='approve';
  return {from:{name:'Smerch korrektur',address:config.user},replyTo:config.user,to:mail.to,subject:(mail.adminTest?'[TEST] ':'')+(approved?'Vi har modtaget din godkendelse · Smerch':'Vi har registreret dine ændringsønsker · Smerch'),text:[mail.adminTest?'TEST – Ingen betaling eller produktion sættes i gang.':'',approved?'Tak! Vi har modtaget din godkendelse af korrekturen. Vi klargør nu din ordre til produktion.':'Tak! Vi har registreret, at du ønsker ændringer. Du modtager snart en ny korrektur til godkendelse. Produkterne sættes først i produktion, når du har godkendt den endelige korrektur.',`Ordre: ${mail.reference}`,`Korrekturversion: ${mail.version}`,!approved&&mail.comment?`Dine ændringsønsker: ${mail.comment}`:'',`Har du spørgsmål, kan du svare på denne mail til ${config.user}.`].filter(Boolean).join('\n\n')};
 }

 return {from:{name:'Smerch korrektur',address:config.user},replyTo:{name:'Smerch korrektur',address:config.user},to:mail.to,subject:mail.adminTest?'[TEST] Korrektur til godkendelse · Smerch':mail.sentCount?'Påmindelse: Din korrektur afventer dig · Smerch':'Korrektur til godkendelse · Smerch',text:proofInvitationText(mail,config),html:proofInvitationHTML(mail,config),disableFileAccess:true,disableUrlAccess:true,attachments:[{filename:'smerch.png',content:readFileSync(new URL('../dist/assets/smerch-email.png',import.meta.url)),contentType:'image/png',cid:'smerch-proof-logo@smerch.dk',contentDisposition:'inline'}]};
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
   if(['receipt','staff_decision'].includes(mail.kind)){
    const decision=order?.proofs?.find(proof=>proof.version===mail.version)?.decision;
    if(!decision||decision.at!==mail.decisionAt||decision.decision!==mail.decision)continue;
    if(mail.lastAttemptAt&&now-Date.parse(mail.lastAttemptAt)<15*60000)continue;
    mail.lastAttemptAt=new Date(now).toISOString();await save(path,mail);
    try{await sender.sendMail(proofMailMessage(mail,config));mail.sentCount=1;mail.lastSentAt=new Date(now).toISOString();mail.status='complete';delete mail.error;}catch{mail.error='Mailen kunne ikke sendes. Der forsøges igen.';}
    await save(path,mail);continue;
   }
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
export async function proofMailStatus(id){const files=await readdir(directory()).catch(()=>[]),records=[];for(const name of files.filter(name=>name.startsWith(id+'-')&&name.endsWith('.json'))){const {kind,version,status,sentCount,lastSentAt,error}=JSON.parse(await readFile(dataPath('proof-mail',name),'utf8'));if(['receipt','staff_decision'].includes(kind))continue;records.push({version,status,sentCount,lastSentAt,error});}return records;}
