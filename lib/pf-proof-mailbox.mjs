import {ImapFlow} from 'imapflow';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile,rename,rmdir} from 'node:fs/promises';
import {dataPath} from './data-path.mjs';
import {automationSettings} from './automation-settings.mjs';
import {parsePFProofEmail} from './pf-proof-email.mjs';
import {receiveProof} from './proof-intake.mjs';
const dir=()=>dataPath('proof-mailbox');
const rootFile=()=>dataPath('proof-mailbox','state.json');
const maxSize=15*1024*1024;
async function load(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function save(path,value){await mkdir(dir(),{recursive:true,mode:0o700});const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,path);}
export function proofMailboxConfiguration(env=process.env){const user=env.PF_PROOF_IMAP_USER||env.PROOF_SMTP_USER||'korrektur@smerch.dk',password=env.PF_PROOF_IMAP_PASSWORD||env.PROOF_SMTP_PASSWORD||'',host=env.PF_PROOF_IMAP_HOST||'imap.one.com';return {host,port:993,secure:true,user,password,mailbox:'INBOX',ready:host==='imap.one.com'&&user==='korrektur@smerch.dk'&&Boolean(password)};}
const accountKey=config=>createHash('sha256').update(config.host+'\n'+config.user+'\n'+config.mailbox).digest('hex');
function clientFor(config){const client=new ImapFlow({host:config.host,port:config.port,secure:true,auth:{user:config.user,pass:config.password},logger:false,emitLogs:false,disableAutoIdle:true,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000,tls:{minVersion:'TLSv1.2',rejectUnauthorized:true}});client.on('error',()=>{});return client;}
async function withMailbox(config,clientFactory,fn){if(!config.ready)throw Error('IMAP mangler konto/adgangskode eller bruger en ikke-understøttet vært.');const client=clientFactory(config);try{await client.connect();const lock=await client.getMailboxLock(config.mailbox,{readOnly:true});try{if(!client.secureConnection||!client.mailbox?.readOnly)throw Error('Postkassen skal åbnes krypteret og med læseadgang.');return await fn(client);}finally{lock.release();}}finally{try{await client.logout();}catch{client.close();}}}
async function exclusive(fn){await mkdir(dir(),{recursive:true,mode:0o700});const lock=dataPath('proof-mailbox','poll.lock');try{await mkdir(lock,{mode:0o700});}catch(e){if(e.code==='EEXIST')throw Error('Postkassen behandles eller kræver driftsafstemning efter en afbrydelse.');throw e;}try{return await fn();}finally{await rmdir(lock);}}
export async function proofMailboxItems(orderId){const rows=[];for(const name of await readdir(dir()).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){if(!/^[a-f0-9]{64}\.json$/.test(name))continue;const row=await load(dataPath('proof-mailbox',name));if(!orderId||row.orderId===orderId)rows.push(row);}return rows.sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt)).slice(0,200);}
export async function proofMailboxStatus({env=process.env}={}){const config=proofMailboxConfiguration(env),state=await load(rootFile(),{});return {configured:config.ready,enabled:(await automationSettings()).proofMailboxEnabled,host:config.host,user:config.user,readOnly:true,connected:state.account===accountKey(config)&&Boolean(state.uidValidity),lastCheckedAt:state.lastCheckedAt,lastConnectedAt:state.lastConnectedAt,error:state.error,paused:state.paused===true,items:await proofMailboxItems()};}
export async function connectProofMailbox({env=process.env,clientFactory=clientFor,reset=false}={}){return exclusive(async()=>{const config=proofMailboxConfiguration(env),state=await load(rootFile(),{});try{return await withMailbox(config,clientFactory,async client=>{const validity=String(client.mailbox.uidValidity);if(state.uidValidity&&state.uidValidity!==validity&&!reset)throw Error('Postkassens UIDVALIDITY er ændret. Afstem postkassen før genstart.');const same=state.account===accountKey(config)&&state.uidValidity===validity;const next={...state,account:accountKey(config),uidValidity:validity,lastUid:same&&!reset?state.lastUid:Math.max(0,Number(client.mailbox.uidNext)-1),lastConnectedAt:new Date().toISOString(),lastCheckedAt:new Date().toISOString(),paused:false,error:null};await save(rootFile(),next);return {connected:true,readOnly:true,messages:client.mailbox.exists,lastUid:next.lastUid,historySkipped:!same||reset};});}catch{state.error='Postkassen kunne ikke tilsluttes. Kontrollér konto, adgangskode, TLS og eventuel UID-afstemning.';state.lastCheckedAt=new Date().toISOString();await save(rootFile(),state);throw Error(state.error);}});}
export async function processProofMailbox({env=process.env,clientFactory=clientFor,parse=parsePFProofEmail,receive=receiveProof,forceReview=false}={}){
 if(!(await automationSettings()).proofMailboxEnabled)return {skipped:true};
 return exclusive(async()=>{const config=proofMailboxConfiguration(env),state=await load(rootFile(),{});if(state.paused)return {paused:true};
 try{return await withMailbox(config,clientFactory,async client=>{
  if(state.account!==accountKey(config)||!state.uidValidity)throw Error('Tilslut og kontrollér postkassen først.');
  if(state.uidValidity!==String(client.mailbox.uidValidity)){state.paused=true;throw Error('UIDVALIDITY er ændret.');}
  const end=Math.min(Number(client.mailbox.uidNext)-1,state.lastUid+1000);if(end<=state.lastUid){state.lastCheckedAt=new Date().toISOString();state.error=null;await save(rootFile(),state);return {processed:0,readOnly:true};}
  const snapshot=await client.fetchAll(`${state.lastUid+1}:${end}`,{uid:true,envelope:true,size:true},{uid:true});
  const messages=snapshot.filter(m=>m.uid>state.lastUid).sort((a,b)=>a.uid-b.uid).slice(0,25);let processed=0;
  for(const message of messages){
   const key=createHash('sha256').update(state.account+':'+state.uidValidity+':'+message.uid).digest('hex'),dest=dataPath('proof-mailbox',key+'.json');
   const existing=await load(dest,null);
   if(!existing){
    const record={key,uid:message.uid,receivedAt:new Date().toISOString(),status:'ignored'};
    if(/e-proof for approval/i.test(message.envelope?.subject||'')){
     if(!Number.isFinite(message.size)||message.size>maxSize){record.status='blocked';record.error='PF-mailen er for stor eller har ukendt størrelse.';}
     else{
      const fetched=await client.fetchOne(message.uid,{source:{start:0,maxLength:maxSize+1}},{uid:true});
      if(!Buffer.isBuffer(fetched?.source)||fetched.source.length>maxSize)throw Error('PF-mailen kunne ikke hentes sikkert.');
      await writeFile(dataPath('proof-mailbox',key+'.eml'),fetched.source,{mode:0o600});
      const parsed=await parse(fetched.source);
      if(parsed.purchaseOrderNumber&&/^SMERCH-[a-f0-9-]{36}$/.test(parsed.purchaseOrderNumber))record.orderId='ord-'+parsed.purchaseOrderNumber.slice(7);
      if(parsed.status==='ready'){
       const result=await receive(parsed.input,{env,mailbox:true,allowAutomatic:!forceReview});record.status=result.status;record.version=result.version;record.error=result.error;
      }else{record.status='blocked';record.error=parsed.error;}
     }
    }
    await save(dest,record);
   }
   state.lastUid=message.uid;await save(rootFile(),state);processed++;
  }
  if(messages.length===snapshot.length)state.lastUid=end;state.lastCheckedAt=new Date().toISOString();state.error=null;await save(rootFile(),state);return {processed,readOnly:true};
 });}catch{state.lastCheckedAt=new Date().toISOString();state.error='Postkassekontrollen mislykkedes. Tidligere importer er bevaret. Kontrollér IMAP eller postkassens UID-afstemning.';await save(rootFile(),state);return {error:state.error,paused:state.paused===true};}
 });
}
export async function reviewMailboxItem(key,{note}={}){if(!/^[a-f0-9]{64}$/.test(key)||typeof note!=='string'||!note.trim()||note.length>2000)throw Error('Angiv en gyldig reference og behandlingsnote.');return exclusive(async()=>{const dest=dataPath('proof-mailbox',key+'.json'),record=await load(dest,null);if(!record)throw Error('Mailen findes ikke.');record.status='reviewed';record.reviewNote=note.trim();record.reviewedAt=new Date().toISOString();await save(dest,record);return {reviewed:true};});}
