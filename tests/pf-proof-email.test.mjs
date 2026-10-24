import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import {dkimSign} from 'mailauth/lib/dkim/sign';import {dkimVerify} from 'mailauth/lib/dkim/verify';
import {parsePFProofEmail} from '../lib/pf-proof-email.mjs';import {receiveProof} from '../lib/proof-intake.mjs';
import {readOrder,publishCustomerProof,decideProof,customerProof} from '../lib/pf-orders.mjs';
import {proofMailStatus} from '../lib/proof-mail.mjs';import {proofPdf} from './helpers/proof-pdf.mjs';
const root=await mkdtemp(join(tmpdir(),'pf-eml-')),before=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=root;
after(async()=>{if(before===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=before;await rm(root,{recursive:true,force:true});});
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),key=privateKey.export({type:'pkcs8',format:'pem'}),pub=publicKey.export({type:'spki',format:'der'}).toString('base64');
const verify=(raw,options)=>dkimVerify(raw,{...options,resolver:async(name,type)=>{assert.equal(name,'test._domainkey.pfconcept.com');assert.equal(type,'TXT');return [[`v=DKIM1; k=rsa; p=${pub}`]];}});
const template=await readFile(new URL('./fixtures/pf-proof-email-template.html',import.meta.url),'utf8');
async function message({id='00000000-0000-4000-8000-000000000001',date='Fri, 23 Oct 2026 19:01:24 +0200',label='Version 1',from='ccc@pfconcept.com',subject,html,pdfId=id,extraAttachment=false,pdf}={}){
 const reference='SMERCH-'+id;
 const content=pdf||await proofPdf(`Order Number : 1234567\nCustomer Reference : SMERCH-${pdfId}\n${label}`);
 const raw=await new MailComposer({from,to:'korrektur@smerch.dk',subject:subject||`CSE1 - E-proof for approval - Test ApS 1234567 - ${reference}`,date:new Date(date),messageId:`<${randomUUID()}@test.invalid>`,html:html||template.replaceAll('SMERCH-00000000-0000-4000-8000-000000000001',reference),attachments:[{filename:'33111961.pdf',content,contentType:'application/pdf'},...(extraAttachment?[{filename:'extra.pdf',content,contentType:'application/pdf'}]:[])]}).compile().build();
 const signed=await dkimSign(raw,{canonicalization:'relaxed/relaxed',algorithm:'rsa-sha256',headerList:'Date:From:To:Subject:Message-ID',signatureData:[{signingDomain:'pfconcept.com',selector:'test',privateKey:key}]});
 return {raw:Buffer.concat([Buffer.from(signed.signatures),raw]),pdf:content};
}
test('real MIME parser, real local DKIM and PDF extraction agree on PF references',async()=>{const {raw}=await message();const parsed=await parsePFProofEmail(raw,{verify});assert.equal(parsed.status,'ready',parsed.error);assert.equal(parsed.input.pfOrderNumber,1234567);assert.equal(parsed.input.proofReference,'33111961');assert.equal(parsed.input.senderVerified,true);assert.equal(parsed.input.supplierMessage,'');assert.ok(!JSON.stringify(parsed.input).includes('ActionBy'));});
test('forged body, unknown sender, conflicting PDF, extra files and custom comments are blocked',async()=>{const valid=await message();const changed=Buffer.from(valid.raw.toString().replace('Mange tak','MANIPULATED'));assert.equal((await parsePFProofEmail(changed,{verify})).status,'blocked');for(const options of [{from:'attacker@example.test'},{pdfId:'00000000-0000-4000-8000-000000000099'},{extraAttachment:true},{html:template.replace('Kære kunde,','Kære kunde, Vigtigt: Produktet er ændret.')}]){const {raw}=await message(options);assert.equal((await parsePFProofEmail(raw,{verify})).status,'blocked');}});
test('a simulated revised PF email invalidates the old approval and stale links; duplicates do not reissue',async()=>{
 const id='ord-'+randomUUID(),pay='pay-'+randomUUID(),uuid=id.slice(4);await mkdir(join(root,'orders'),{recursive:true});await mkdir(join(root,'checkouts'),{recursive:true});
 await writeFile(join(root,'orders',id+'.json'),JSON.stringify({id,checkoutId:pay,purchaseOrderNumber:'SMERCH-'+uuid,pfOrderNumber:1234567,status:'awaiting_proof',shipping:{email:'customer@example.test'},lines:[],events:[]}));await writeFile(join(root,'checkouts',pay+'.json'),JSON.stringify({id:pay,status:'authorized',shipping:{email:'customer@example.test'},pfOrderIds:[id],lines:[]}));
 const first=await message({id:uuid}),a=await parsePFProofEmail(first.raw,{verify});assert.equal(a.status,'ready',a.error);await receiveProof(a.input,{mailbox:true});
 const invite=await publishCustomerProof(id,{version:1}),token=new URLSearchParams(new URL(invite.url).hash.slice(1)).get('token');await decideProof(id,{version:1,decision:'approve',customerToken:token});
 const second=await message({id:uuid,date:'Sat, 24 Oct 2026 12:00:00 +0200',label:'Version 2 changed logo size'}),b=await parsePFProofEmail(second.raw,{verify});assert.equal(b.status,'ready',b.error);const result=await receiveProof(b.input,{mailbox:true});assert.equal(result.version,2);assert.equal((await readOrder(id)).decision,null);assert.equal((await readOrder(id)).status,'proof_received');await assert.rejects(customerProof(id,token));
 await receiveProof(b.input,{mailbox:true});const oldAgain=await message({id:uuid,pdf:first.pdf});const oldParsed=await parsePFProofEmail(oldAgain.raw,{verify});assert.equal((await receiveProof(oldParsed.input,{mailbox:true})).status,'obsolete');assert.equal((await readOrder(id)).proof.version,2);assert.equal((await proofMailStatus(id)).length,3);
});
