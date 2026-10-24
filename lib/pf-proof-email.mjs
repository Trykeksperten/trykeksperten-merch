import {htmlToText} from 'html-to-text';
import {simpleParser} from 'mailparser';
import {dkimVerify} from 'mailauth/lib/dkim/verify';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
const referencePattern=/SMERCH-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g;
export function templateFingerprint(text){return createHash('sha256').update(String(text).replace(/Department code:[\s\S]*$/i,'').replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim()).digest('hex');}
// PF CSE1 template verified against the original email supplied by the owner.
const knownTemplate='0e5cbcd15c88d6d5e439f5e868580d49bf0a859ab41170579cc320ed51c71c2f';
export function extractProofPDF(bytes){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./pf-proof-pdf-worker.mjs',import.meta.url),{workerData:new Uint8Array(bytes),execArgv:[],resourceLimits:{maxOldGenerationSizeMb:128}});const timer=setTimeout(()=>{worker.terminate();reject(Error('PDF-kontrollen tog for lang tid.'));},20000);worker.once('message',result=>{clearTimeout(timer);worker.terminate();result.error?reject(Error(result.error)):resolve(result.text);});worker.once('error',()=>{clearTimeout(timer);reject(Error('PDF-kontrollen mislykkedes.'));});worker.once('exit',code=>{if(code!==0){clearTimeout(timer);reject(Error('PDF-kontrollen blev afbrudt.'));}});});}
export async function parsePFProofEmail(raw,{verify=dkimVerify,extractPDF=extractProofPDF,now=Date.now()}={}){
 if(!Buffer.isBuffer(raw)||raw.length>15*1024*1024)throw Error('Mailen skal være højst 15 MB.');
 let mail;try{mail=await simpleParser(raw,{skipImageLinks:true,skipTextToHtml:true,maxHtmlLengthToParse:200000});}catch{return {status:'blocked',error:'Mailens MIME-format kunne ikke læses.'};}
 const subject=String(mail.subject||''),refs=[...new Set(subject.match(referencePattern)||[])];
 const partial={purchaseOrderNumber:refs.length===1?refs[0]:undefined,originalMessageId:mail.messageId};
 try{
  if(!/^CSE1\s*-\s*E-proof for approval\s*-/i.test(subject))throw Error('Mailen er ikke en genkendt PF-korrektur.');
  for(const key of ['from','to','date','subject','message-id'])if(mail.headerLines.filter(row=>row.key===key).length!==1)throw Error('Mailens headers er manglende eller flertydige.');
  if(mail.from?.value?.length!==1||mail.from.value[0].address?.toLowerCase()!=='ccc@pfconcept.com')throw Error('PF-afsenderen er ikke genkendt.');
  if(mail.to?.value?.length!==1||mail.to.value[0].address?.toLowerCase()!=='korrektur@smerch.dk')throw Error('Mailen er ikke adresseret til korrektur@smerch.dk.');
  const auth=await verify(raw,{minBitLength:2048,rejectRsaSha1:true});
  const valid=auth.results?.some(row=>row.signingDomain?.toLowerCase()==='pfconcept.com'&&row.status?.result==='pass'&&row.algo==='rsa-sha256'&&!row.canonBodyLengthLimited&&['date','from','to','subject'].every(key=>String(row.signingHeaders?.keys||'').toLowerCase().split(/\s*:\s*/).includes(key)));
  if(!valid)throw Error('PF-mailens fulde DKIM-signatur kunne ikke bekræftes.');
  if(!mail.messageId||mail.messageId.length>500)throw Error('Mailens besked-id mangler eller er ugyldigt.');
  if(!mail.date||!Number.isFinite(mail.date.getTime())||mail.date.getTime()>now+5*60000)throw Error('PF-mailens tidspunkt mangler eller ligger i fremtiden.');
  const subjectMatch=/\s(\d+)\s*-\s*(SMERCH-[a-f0-9-]{36})\s*$/i.exec(subject);
  if(refs.length!==1||!subjectMatch||subjectMatch[2]!==refs[0])throw Error('Emnelinjens ordretilknytning er usikker.');
  if(typeof mail.html!=='string'||mail.html.length>200000)throw Error('Mailens HTML-indhold mangler eller er for stort.');
  const text=htmlToText(mail.html,{wordwrap:false}),bodyRefs=[...new Set(text.match(referencePattern)||[])],so=[...text.matchAll(/\bSO:\s*(\d+)/g)].map(m=>m[1]);
  if(bodyRefs.length!==1||bodyRefs[0]!==refs[0]||so.length!==1||so[0]!==subjectMatch[1])throw Error('Emnelinje og mailens ordreferencer stemmer ikke overens.');
  if(templateFingerprint(text)!==knownTemplate)throw Error('PF-mailens tekst er ændret eller indeholder nye oplysninger. Gennemgå mailen før afsendelse.');
  const attachments=mail.attachments.filter(a=>a.contentDisposition!=='inline');
  if(attachments.length!==1||attachments[0].contentType!=='application/pdf'||!/^\d{4,20}\.pdf$/i.test(attachments[0].filename||''))throw Error('En entydig, genkendt PF-korrektur-PDF kræves.');
  const file=attachments[0];if(file.content.length>10*1024*1024||file.content.subarray(0,5).toString()!=='%PDF-')throw Error('Korrektur-PDF’en er ugyldig eller for stor.');
  const pdf=await extractPDF(file.content),pdfRefs=[...new Set(pdf.match(referencePattern)||[])],numbers=[...pdf.matchAll(/Order\s+Number\s*:\s*(\d+)/gi)].map(m=>m[1]);
  if(pdfRefs.length!==1||pdfRefs[0]!==refs[0]||!numbers.length||numbers.some(n=>n!==subjectMatch[1]))throw Error('PDF’ens ordre og reference matcher ikke mailen.');
  return {status:'ready',...partial,input:{messageId:'pf-mail-'+createHash('sha256').update(mail.messageId).digest('hex'),purchaseOrderNumber:refs[0],pfOrderNumber:Number(subjectMatch[1]),proofReference:file.filename.replace(/\.pdf$/i,''),senderVerified:true,mimeType:'application/pdf',contentBase64:file.content.toString('base64'),supplierIssuedAt:mail.date.toISOString(),supplierMessage:''}};
 }catch(error){return {status:'blocked',...partial,error:error.message};}
}
