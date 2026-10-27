import {customerTextMail} from './customer-mail-layout.mjs';
import {automationSettings} from './automation-settings.mjs';
import {readFileSync} from 'node:fs';
import {proofInvitationHTML,proofInvitationText} from './proof-mail-template.mjs';
import {mkdir,readFile,readdir,writeFile,rename,rmdir,link,unlink,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import nodemailer from 'nodemailer';
import {dataPath} from './data-path.mjs';
import {contactConfiguration} from './contact.mjs';
import {readOrder} from './pf-orders.mjs';
import {readCheckout} from './checkout.mjs';
export function proofMailConfiguration(env=process.env){
 return contactConfiguration({CONTACT_SMTP_HOST:env.PROOF_SMTP_HOST||'send.one.com',CONTACT_SMTP_PORT:env.PROOF_SMTP_PORT||465,CONTACT_SMTP_SECURE:env.PROOF_SMTP_SECURE??'1',CONTACT_SMTP_USER:env.PROOF_SMTP_USER||'korrektur@smerch.dk',CONTACT_SMTP_PASSWORD:env.PROOF_SMTP_PASSWORD||'',CONTACT_TO_EMAIL:env.PROOF_SMTP_USER||'korrektur@smerch.dk'});
}
export function proofMailMessage(mail,config){
 if(mail.kind==='staff_decision'){
  const approved=mail.decision==='approve';
  return {from:{name:'Smerch korrektur',address:config.user},replyTo:mail.customerEmail||config.user,to:'korrektur@smerch.dk',subject:(mail.adminTest?'[TEST] ':'')+(approved?'Kunden har godkendt korrekturen':'Kunden ønsker ændringer')+' · '+(mail.pfOrderNumber||mail.reference),text:[
   mail.adminTest?'TEST – Ingen betaling eller produktion sættes i gang.':'',
   approved?'Kunden har godkendt korrekturen. Gennemgå den aktuelle version og godkend den internt hos Smerch, før svaret sendes til PF.':'Kunden ønsker ændringer. Gennemgå svaret og indhent en ny korrektur fra PF.',
   `Smerch-reference: ${mail.reference}`,mail.pfOrderNumber?`PF-ordre: ${mail.pfOrderNumber}`:'',
   `Korrektur: ${mail.proofReference} · version ${mail.version}`,`Kundens svar registreret: ${mail.decisionAt}`,
   mail.customerEmail?`Kunde: ${mail.customerEmail}`:'',mail.comment?`Kundens kommentar: ${mail.comment}`:'',
   mail.attachmentCount?`Kunden har vedhæftet ${mail.attachmentCount} bilag. Se dem på ordren.`:'',
   'Åbn ordren (medarbejderlogin kræves):',`https://smerch.dk/admin/pf-orders#order=${encodeURIComponent(mail.id)}`,
   'Kontrollér den aktuelle korrekturversion og status på ordren før næste handling.',
   approved?'Denne mail sender ikke godkendelsen til PF. Kundens godkendelse alene udløser ingen hævning. Følg de aftalte betalingsvilkår på ordren: Ved aftalt kortforudbetaling skal betalingen være bekræftet efter kundens og Smerchs godkendelse, før svaret sendes til PF. Ældre ordrer følger deres oprindelige vilkår.':'Denne mail sender ikke svaret til PF. Ændringsønsker udløser ingen hævning og frigiver ikke produktionen.'
  ].filter(Boolean).join('\n\n')};
 }

 if(mail.kind==='receipt'){
  const approved=mail.decision==='approve';
  const message={from:{name:'Smerch korrektur',address:config.user},replyTo:config.user,to:mail.to,subject:(mail.adminTest?'[TEST] ':'')+(approved?'Vi har modtaget din godkendelse · Smerch':'Vi har registreret dine ændringsønsker · Smerch'),text:[mail.adminTest?'TEST – Ingen betaling eller produktion sættes i gang.':'',approved?'Tak! Vi har modtaget din godkendelse af korrekturen. Vi gennemgår nu din godkendelse hos Smerch, før ordren frigives til produktion. Betalingen følger de vilkår, du accepterede ved bestillingen.':'Tak! Vi har registreret, at du ønsker ændringer. Du modtager snart en ny korrektur til godkendelse. Produkterne sættes først i produktion, når du har godkendt den endelige korrektur.',`Ordre: ${mail.reference}`,`Korrekturversion: ${mail.version}`,!approved&&mail.comment?`Dine ændringsønsker: ${mail.comment}`:'',`Har du spørgsmål, kan du svare på denne mail til ${config.user}.`].filter(Boolean).join('\n\n')};
  message.html=customerTextMail(approved?'Godkendelse modtaget':'Ændringsønsker modtaget',message.text,{email:config.user});return message;
 }

 return {from:{name:'Smerch korrektur',address:config.user},replyTo:{name:'Smerch korrektur',address:config.user},to:mail.to,subject:mail.adminTest?'[TEST] Korrektur til godkendelse · Smerch':mail.sentCount?'Påmindelse: Din korrektur afventer dig · Smerch':'Korrektur til godkendelse · Smerch',text:proofInvitationText(mail,config),html:proofInvitationHTML(mail,config),disableFileAccess:true,disableUrlAccess:true,attachments:[{filename:'smerch.png',content:readFileSync(new URL('../dist/assets/smerch-email.png',import.meta.url)),contentType:'image/png',cid:'smerch-proof-logo@smerch.dk',contentDisposition:'inline'}]};
}
const directory=()=>dataPath('proof-mail');
async function save(path,value){await mkdir(directory(),{recursive:true,mode:0o700});const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,path);}
export async function queueProofMail(record){await mkdir(directory(),{recursive:true,mode:0o700});const destination=dataPath('proof-mail',`${record.id}-${record.version}-${record.tokenHash}.json`),temp=destination+'.'+randomUUID()+'.tmp';try{await writeFile(temp,JSON.stringify({...record,createdAt:new Date().toISOString(),sentCount:0,status:'pending'}),{mode:0o600,flag:'wx'});try{await link(temp,destination);}catch(e){if(e.code!=='EEXIST')throw e;}}finally{await unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
async function acceptedSend(sender,mail,config){const result=await sender.sendMail({...proofMailMessage(mail,config),messageId:`<proof-${mail.id}-${mail.version}-${mail.tokenHash}-${mail.sentCount}@smerch.dk>`});if(!result?.accepted?.some(address=>String(address).toLowerCase()===String(mail.to).toLowerCase()))throw Error('Modtageren blev ikke bekræftet af mailserveren.');}

let busy=false;
export async function retryProofMail({env=process.env,transport,now=Date.now(),orderIds}={}){
 const config=proofMailConfiguration(env);if(busy||(!config.ready&&!transport))return;busy=true;
 try{
  const files=await readdir(directory()).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  const sender=transport||nodemailer.createTransport({host:config.host,port:config.port,secure:config.secure,auth:{user:config.user,pass:config.password},requireTLS:!config.secure});
  for(const name of files.filter(name=>name.endsWith('.json'))){
   const path=dataPath('proof-mail',name),lock=path+'.lock';
   try{await mkdir(lock,{mode:0o700});}catch(e){if(e.code==='EEXIST')continue;throw e;}
   try{const mail=JSON.parse(await readFile(path,'utf8'));if(orderIds&&!orderIds.includes(mail.id))continue;if(['obsolete','complete','uncertain','blocked'].includes(mail.status))continue;if(mail.status==='sending'){mail.status='uncertain';mail.error='Afsendelsen blev afbrudt. Kontrollér mailkontoen før ny afsendelse.';await save(path,mail);continue;}
   const settings=await automationSettings();
   const order=await readOrder(mail.id).catch(()=>null),access=order?.proof?.customer;
   if(['receipt','staff_decision'].includes(mail.kind)){
    if(settings[mail.kind==='receipt'?'decisionReceipt':'staffDecisionMail']==='review'&&!mail.approvedForSend)continue;
    const decision=order?.proofs?.find(proof=>proof.version===mail.version)?.decision;
    if(!decision||decision.at!==mail.decisionAt||decision.decision!==mail.decision)continue;
    if(mail.lastAttemptAt&&now-Date.parse(mail.lastAttemptAt)<15*60000)continue;
    mail.lastAttemptAt=new Date(now).toISOString();mail.status='sending';await save(path,mail);
    try{await acceptedSend(sender,mail,config);mail.sentBy={type:"system",name:"Smerch korrektur",email:config.user};mail.sentCount=1;mail.lastSentAt=new Date(now).toISOString();mail.status='complete';delete mail.error;}catch{mail.status='uncertain';mail.error='Mailens levering er ukendt. Afstem mailkontoen før ny afsendelse.';}
    await save(path,mail);continue;
   }
   if(access?.tokenHash!==mail.tokenHash&&now-Date.parse(mail.createdAt)<60000)continue;
   if(!order||order.proof.version!==mail.version||access?.tokenHash!==mail.tokenHash||Date.parse(access.expiresAt)<=now||order.status!=='proof_received'){mail.status='obsolete';await save(path,mail);continue;}
   const checkout=order.checkoutId?await readCheckout(order.checkoutId).catch(()=>null):null;
   const recipient=checkout?.shipping?.email;
   if(!recipient||String(recipient).trim().toLowerCase()!==String(mail.to).trim().toLowerCase()||(order.shipping?.email&&String(order.shipping.email).trim().toLowerCase()!==String(recipient).trim().toLowerCase())){mail.status='blocked';mail.error='Kundeoplysningerne er ændret eller usikre. Gennemgå ordren og opret et nyt kundelink.';await save(path,mail);continue;}
   if(mail.adminTest&&mail.sentCount>=1){mail.status='complete';await save(path,mail);continue;}
   if(mail.sentCount&&!(await automationSettings()).proofReminders)continue;
   if(mail.sentCount>=3){mail.status='complete';await save(path,mail);continue;}
   if(mail.lastSentAt&&now-Date.parse(mail.lastSentAt)<48*3600000)continue;
   if(mail.lastAttemptAt&&now-Date.parse(mail.lastAttemptAt)<15*60000)continue;
   mail.lastAttemptAt=new Date(now).toISOString();mail.status='sending';await save(path,mail);
   try{await acceptedSend(sender,mail,config);mail.sentBy={type:"system",name:"Smerch korrektur",email:config.user};mail.sentCount++;mail.lastSentAt=new Date(now).toISOString();mail.status='sent';delete mail.error;await save(path,mail);}catch{mail.status='uncertain';mail.error='Mailens levering er ukendt. Afstem mailkontoen før ny afsendelse.';await save(path,mail);}
   }finally{await rmdir(lock);}
  }
 }finally{busy=false;}
}
export async function proofMailStatus(id){const files=await readdir(directory()).catch(()=>[]),records=[];for(const name of files.filter(name=>name.startsWith(id+'-')&&name.endsWith('.json'))){const {kind,version,status,sentCount,lastSentAt,error,to,approvedForSend,initiatedBy,sentBy,approvedBy}=JSON.parse(await readFile(dataPath('proof-mail',name),'utf8'));const locked=await stat(dataPath('proof-mail',name)+'.lock').then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});records.push({initiatedBy,sentBy,approvedBy,key:name,kind:kind||'invitation',version,status:locked?'sending':status,sentCount,lastSentAt,error:locked?'Mailen behandles eller er afbrudt. Ved vedvarende lås skal driften afstemme mailkontoen før genforsøg.':error,to,approvedForSend});}return records;}

export async function retryProofMailRecord(id,key,{confirmedNotSent=false,initiatedBy}={}){
 if(!/^ord-[a-f0-9-]{36}$/.test(id)||!key?.startsWith(id+'-')||!/^[a-z0-9-]+\.json$/.test(key))throw Error('Ugyldig mailreference.');
 const path=dataPath('proof-mail',key),lock=path+'.lock';try{await mkdir(lock,{mode:0o700});}catch(e){if(e.code==='EEXIST')throw Error('Afsendelsen er låst. Afstem driften og mailkontoen før genforsøg.');throw e;}try{const mail=JSON.parse(await readFile(path,'utf8'));
 if(mail.status==='uncertain'&&!confirmedNotSent)throw Error('Bekræft først i mailkontoen, at beskeden ikke er sendt.');
 if(!['uncertain','pending'].includes(mail.status))throw Error('Beskeden er allerede behandlet.');
 mail.approvedForSend=true;mail.approvedBy=initiatedBy||null;mail.status=mail.sentCount?'sent':'pending';delete mail.lastAttemptAt;delete mail.error;await save(path,mail);
 }finally{await rmdir(lock);}
}
