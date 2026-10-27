// PF E-proof appendix 1.2.1. No supplier URLs are fetched by this module.
import {createHash,timingSafeEqual} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
const hash=value=>createHash('sha256').update(value).digest('hex');
function text(value,label,max=500){if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`${label} mangler eller er ugyldig.`);return value.trim();}
// Thomas/PF confirmed that e-proof approval uses the existing Gateway credentials.
// Never borrow a production-only password for the test endpoint (or vice versa).
function eproofCredentials(env){
 const mode=env.PF_EPROOF_MODE;
 const username=env.PF_EPROOF_USERNAME||env.PF_GATEWAY_USERNAME;
 const gatewayPassword=mode==='test'?env.PF_GATEWAY_TEST_PASSWORD:mode==='live'?env.PF_GATEWAY_PROD_PASSWORD:undefined;
 const legacyPassword=env.PF_GATEWAY_MODE===mode?env.PF_GATEWAY_PASSWORD:undefined;
 const hasOverride=Boolean(env.PF_EPROOF_USERNAME||env.PF_EPROOF_PASSWORD);
 if(hasOverride&&!(env.PF_EPROOF_USERNAME&&env.PF_EPROOF_PASSWORD))throw Error('Begge særskilte PF-korrektur adgangsoplysninger kræves, eller brug Gateway-oplysningerne.');
 return {username,password:hasOverride?env.PF_EPROOF_PASSWORD:(gatewayPassword||legacyPassword),source:hasOverride?'eproof':'gateway'};
}
export function eproofConfiguration(env=process.env){
 if(env.PF_EPROOF_ENABLED!=='1'||!['test','live'].includes(env.PF_EPROOF_MODE))throw Error('PF-korrektur API er ikke aktiveret og konfigureret.');
 const credentials=eproofCredentials(env);
 return {mode:env.PF_EPROOF_MODE,senderId:text(env.PF_GATEWAY_SENDER_ID,'Sender-id'),username:text(credentials.username,'PF Gateway-brugernavn'),password:text(credentials.password,env.PF_EPROOF_MODE==='test'?'PF Gateway-testadgangskode':'PF Gateway-produktionsadgangskode'),url:`https://wsa.pfconcept.com/${env.PF_EPROOF_MODE==='test'?'test/':''}RestGateway/rest/RestGatewayService/eproof-approval`};
}
// Administrative status only: never return usernames, passwords or sender IDs.
export function eproofReadiness(env=process.env){
 const mode=['test','live'].includes(env.PF_EPROOF_MODE)?env.PF_EPROOF_MODE:'off',missing=[];
 const configured=value=>typeof value==='string'&&Boolean(value.trim());
 if(mode==='off')missing.push('PF_EPROOF_MODE');
 let credentials;try{credentials=eproofCredentials(env);}catch{missing.push('PF_EPROOF_USERNAME + PF_EPROOF_PASSWORD');}
 if(credentials){if(!configured(credentials.username))missing.push('PF_GATEWAY_USERNAME');if(!configured(credentials.password))missing.push(mode==='live'?'PF_GATEWAY_PROD_PASSWORD':'PF_GATEWAY_TEST_PASSWORD');}
 if(!configured(env.PF_GATEWAY_SENDER_ID))missing.push('PF_GATEWAY_SENDER_ID');
 if(!configured(env.PF_EPROOF_CALLBACK_USERNAME))missing.push('PF_EPROOF_CALLBACK_USERNAME');
 if(String(env.PF_EPROOF_CALLBACK_PASSWORD||'').length<32)missing.push('PF_EPROOF_CALLBACK_PASSWORD (mindst 32 tegn)');
 if(!configured(env.PF_EPROOF_EXPECTED_SENDER_ID))missing.push('PF_EPROOF_EXPECTED_SENDER_ID (skal bekræftes af PF)');
 const enabled=env.PF_EPROOF_ENABLED==='1';
 return {enabled,mode,credentialSource:credentials?.source||null,configured:missing.length===0,ready:enabled&&missing.length===0,manualStaffApprovalRequired:true,missing};
}
export function eproofCallbackAuthorized(req,env=process.env){
 if(env.PF_EPROOF_ENABLED!=='1'||!['test','live'].includes(env.PF_EPROOF_MODE)||!env.PF_EPROOF_CALLBACK_USERNAME||String(env.PF_EPROOF_CALLBACK_PASSWORD||'').length<32)return false;
 const actual=Buffer.from(String(req.headers.authorization||'')),expected=Buffer.from('Basic '+Buffer.from(`${env.PF_EPROOF_CALLBACK_USERNAME}:${env.PF_EPROOF_CALLBACK_PASSWORD}`).toString('base64'));
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
function proofBytes(value){
 if(typeof value!=='string'||value.length>14*1024*1024||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw Error('Ugyldig Base64Image.');
 const bytes=Buffer.from(value,'base64');if(!bytes.length||bytes.length>10*1024*1024)throw Error('Korrekturfilen må højst være 10 MB.');
 const mimeType=bytes.subarray(0,5).toString()==='%PDF-'?'application/pdf':bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':null;
 if(!mimeType)throw Error('Base64Image skal indeholde PDF, PNG eller JPEG.');return {bytes,mimeType};
}
export async function normalizeEproof(payload,{env=process.env}={}){
 if(!Array.isArray(payload?.Eproof)||!payload.Eproof.length||payload.Eproof.length>20)throw Error('Eproof skal indeholde 1–20 korrekturer.');
 const groups=new Map();
 for(const item of payload.Eproof){
  if(!env.PF_EPROOF_EXPECTED_SENDER_ID||item.SenderId!==env.PF_EPROOF_EXPECTED_SENDER_ID)throw Error('PF-korrekturens SenderId matcher ikke den aftalte afsender.');
  const po=text(item.PoNumber,'PoNumber');if(!/^SMERCH-[a-f0-9-]{36}$/.test(po))throw Error('Ukendt Smerch-ordrereference.');
  const so=String(item.SoNumber||'');if(!/^\d+$/.test(so))throw Error('SoNumber mangler.');
  const url=text(item['Url-Eproof'],'Url-Eproof',2000);const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw Error('Ugyldigt korrekturlink.');
  if(!Array.isArray(item.configuration)||!item.configuration.length||item.configuration.length>20)throw Error('Korrekturkonfiguration mangler.');
  const configs=item.configuration.map(c=>{
   const reference=text(c.EproofRef,'EproofRef',150);
   if(!Array.isArray(c.SKUs)||!c.SKUs.length||c.SKUs.length>100)throw Error('SKU-tilknytning mangler.');
   return {reference,url,SKUs:c.SKUs.map(s=>({sku:text(s.sku,'sku',100),lineReference:text(s.lineReference,'lineReference',200)})),description:[c.methodDescription,c.location,c.NumberOfColors,c.dimensionMM,c.color].filter(v=>v!==undefined).join(' · ')};
  });
  let group=groups.get(po);if(!group){group={purchaseOrderNumber:po,pfOrderNumber:so,files:[],configurations:[]};groups.set(po,group);}if(group.pfOrderNumber!==so)throw Error('Modstridende PF-ordrenumre.');
  group.files.push(proofBytes(item.Base64Image));group.configurations.push(...configs);
 }
 const normalized=[];
 for(const group of groups.values()){
  if(group.configurations.length>20)throw Error('Højst 20 korrekturkonfigurationer pr. ordre.');
  if(new Set(group.configurations.map(c=>c.reference)).size!==group.configurations.length)throw Error('Samme korrekturreference optræder flere gange i beskeden.');
  const fingerprint=hash(JSON.stringify([group.purchaseOrderNumber,group.pfOrderNumber,group.configurations.map(({url,...c})=>c),group.files.map(f=>hash(f.bytes))]));
  let file=group.files[0];
  if(group.files.length>1){const pdf=await PDFDocument.create();for(const f of group.files){if(f.mimeType==='application/pdf'){const source=await PDFDocument.load(f.bytes);if(source.getPageCount()>40)throw Error('For mange korrektursider.');for(const p of await pdf.copyPages(source,source.getPageIndices()))pdf.addPage(p);}else{const img=f.mimeType==='image/png'?await pdf.embedPng(f.bytes):await pdf.embedJpg(f.bytes);const scale=Math.min(1,1200/Math.max(img.width,img.height));const page=pdf.addPage([img.width*scale,img.height*scale]);page.drawImage(img,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});}}file={bytes:Buffer.from(await pdf.save()),mimeType:'application/pdf'};}
  normalized.push({purchaseOrderNumber:group.purchaseOrderNumber,pfOrderNumber:group.pfOrderNumber,proofReference:group.configurations[0].reference,contentBase64:file.bytes.toString('base64'),mimeType:file.mimeType,messageId:'eproof-'+fingerprint,supplierMessage:group.configurations.map(c=>c.description).join('\n').slice(0,2000),api:{fingerprint,mode:env.PF_EPROOF_MODE,configurations:group.configurations}});
 }
 return normalized;
}
export function approvalPayload(order,configuration,{messageId,timestamp,senderId,newArt=[]}){
 const decision=order.decision;
 return {messageId,timestamp,senderId,eproof:{poNumber:order.purchaseOrderNumber,EproofRef:configuration.reference,'Url-Eproof':configuration.url,SKUs:configuration.SKUs,isApproved:decision.decision==='approve',...(decision.decision==='reject'?{rejectionReason:decision.comment,...(newArt.length?{newArt}:{} )}:{})}};
}
export function validateNewArt(value){
 if(!Array.isArray(value)||value.length>20)throw Error('Ugyldige artwork-links.');
 return value.map(row=>{const artUrl=text(row.artUrl,'Artwork-link',2000),url=new URL(artUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error('Artwork kræver et offentligt HTTPS-link.');return {artUrl,color:text(row.color,'Farve',100),height:text(row.height,'Højde',30),width:text(row.width,'Bredde',30)};});
}
export async function postEproof(payload,{config,fetchImpl=fetch}){
 const response=await fetchImpl(config.url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:'Basic '+Buffer.from(`${config.username}:${config.password}`).toString('base64')},body:JSON.stringify(payload)});
 // The appendix does not define a business acknowledgement. HTTP success is
 // recorded only as delivery; it never marks the proof approved by PF.
 if(!response.ok)throw Error(`PF returnerede HTTP ${response.status}. Afstem med PF før et nyt forsøg.`);
 const body=await response.text();if(body.length>65536)throw Error('PF-svaret kræver manuel afstemning.');
 if(body.trim()){let data;try{data=JSON.parse(body);}catch{throw Error('PF returnerede et ukendt svar. Afstem med PF.');}if(data?.success===false||data?.error||data?.errors||data?.isApproved===false||/error|reject|fail/i.test(String(data?.status||'')))throw Error('PF-svaret kræver manuel afstemning.');}
 return {httpStatus:response.status,responseHash:hash(body)};
}
