import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {dispatchOrder,recordApprovalDelivery,recordExternalApproval,recordProof,publishCustomerProof,customerProof,customerProofFile,decideProof,readOrder,readFeedbackFile} from '../lib/pf-orders.mjs';
import {retryProofMail,proofMailStatus} from '../lib/proof-mail.mjs';
import {proofQueue} from '../dist/proof-status.mjs';
const directory=await mkdtemp(join(tmpdir(),'smerch-proof-test-')),previous=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=directory;
after(async()=>{if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;await rm(directory,{recursive:true,force:true});});
const pdf=Buffer.from('%PDF-1.4\nTest proof');
async function fixture(){const id='ord-'+randomUUID(),checkoutId='pay-'+randomUUID();await mkdir(join(directory,'orders'),{recursive:true});await mkdir(join(directory,'checkouts'),{recursive:true});await writeFile(join(directory,'orders',id+'.json'),JSON.stringify({id,checkoutId,purchaseOrderNumber:'SMERCH-'+id.slice(4),status:'awaiting_proof',lines:[{productId:'pf-test',sku:'TEST',quantity:50,decorations:[{position:'Forside',width:20,height:10,colors:1}]}],events:[]}));await writeFile(join(directory,'checkouts',checkoutId+'.json'),JSON.stringify({id:checkoutId,status:'authorized',shipping:{email:'test@example.invalid'},lines:[{productId:'pf-test',sku:'TEST',productName:'Testprodukt'}]}));await recordProof(id,{proofReference:'PF-1',contentBase64:pdf.toString('base64'),mimeType:'application/pdf'});return {id,checkoutId};}
async function invite(id,version=1){const link=await publishCustomerProof(id,{version,message:'Lidt mere luft mellem bogstaverne.'});return new URLSearchParams(new URL(link.url).hash.slice(1)).get('token');}
test('personal proof link exposes only customer data and rejects invalid or expired access',async()=>{const {id}=await fixture();await assert.rejects(customerProof(id,'b'.repeat(64)));const token=await invite(id),view=await customerProof(id,token);assert.equal(view.version,1);assert.equal(view.lines[0].name,'Testprodukt');assert.equal(view.tokenHash,undefined);assert.equal(view.shipping,undefined);assert.equal(view.supplierTotal,undefined);assert.deepEqual((await customerProofFile(id,token)).data,pdf);const order=await readOrder(id);order.proof.customer.expiresAt='2000-01-01';await writeFile(join(directory,'orders',id+'.json'),JSON.stringify(order));await assert.rejects(customerProof(id,token),/udløbet/);});
test('only customer can approve a checkout proof; no payment capture or PF release occurs',async()=>{const {id,checkoutId}=await fixture(),token=await invite(id);await assert.rejects(decideProof(id,{version:1,decision:'approve'}),/Kunden skal selv/);const order=await decideProof(id,{version:1,decision:'approve',customerToken:token});assert.equal(order.status,'approval_pending_pf');assert.equal(order.decision.actor,'customer');assert.equal(order.decision.proofHash,order.proof.hash);assert.equal(JSON.parse(await readFile(join(directory,'checkouts',checkoutId+'.json'))).status,'authorized');assert.equal(proofQueue(order),'smerch');await assert.rejects(decideProof(id,{version:1,decision:'approve',customerToken:token}),/seneste/);});
test('new proof and reissued invitation revoke old tokens; concurrent old-version decisions cannot approve new files',async()=>{const {id}=await fixture(),old=await invite(id),token=await invite(id);await assert.rejects(customerProof(id,old));await recordProof(id,{proofReference:'PF-2',contentBase64:Buffer.from('%PDF-1.4\nNew proof').toString('base64'),mimeType:'application/pdf'});await assert.rejects(customerProof(id,token));const next=await invite(id,2);await assert.rejects(decideProof(id,{version:1,decision:'approve',customerToken:next}),/seneste/);assert.equal((await customerProof(id,next)).version,2);});
test('customer changes require a comment and preserve validated attachments with the proof version',async()=>{const {id}=await fixture(),token=await invite(id);await assert.rejects(decideProof(id,{version:1,decision:'reject',customerToken:token}),/Skriv/);const order=await decideProof(id,{version:1,decision:'reject',comment:'Øg bogstavafstanden',customerToken:token,attachments:[{name:'rettelse.pdf',mimeType:'application/pdf',contentBase64:pdf.toString('base64')}]});assert.equal(order.status,'revision_requested');assert.equal(order.proofs[0].decision.comment,'Øg bogstavafstanden');assert.deepEqual((await readFeedbackFile(id,order.decision.attachments[0].hash)).data,pdf);});
test('mail queue retries failures, sends reminders and stops when the customer answers',async()=>{const {id}=await fixture(),token=await invite(id),now=Date.now();await retryProofMail({now,transport:{sendMail:async()=>{throw Error('offline');}}});assert.equal((await proofMailStatus(id))[0].sentCount,0);const sent=[];await retryProofMail({now:now+16*60000,transport:{sendMail:async mail=>sent.push(mail)}});assert.equal((await proofMailStatus(id))[0].sentCount,1);assert.ok(sent.some(mail=>mail.text.includes(token)));await retryProofMail({now:now+49*3600000,transport:{sendMail:async mail=>sent.push(mail)}});assert.equal((await proofMailStatus(id))[0].sentCount,2);await decideProof(id,{version:1,decision:'reject',comment:'Ret teksten',customerToken:token});await retryProofMail({now:now+98*3600000,transport:{sendMail:async mail=>sent.push(mail)}});assert.equal((await proofMailStatus(id))[0].status,'obsolete');});
test('invalid feedback files never register a customer decision',async()=>{const {id}=await fixture(),token=await invite(id);await assert.rejects(decideProof(id,{version:1,decision:'reject',comment:'Ret logo',customerToken:token,attachments:[{name:'fake.pdf',mimeType:'application/pdf',contentBase64:Buffer.from('<script>bad</script>').toString('base64')}]}),/ugyldig/);assert.equal((await readOrder(id)).status,'proof_received');assert.equal((await readOrder(id)).decision,null);});
test('mail reminders are limited to two and superseded links are not mailed',async()=>{const {id}=await fixture();await invite(id);await invite(id);const now=Date.now()+61000;let sent=0;const transport={sendMail:async()=>sent++};await retryProofMail({now,transport});await retryProofMail({now:now+49*3600000,transport});await retryProofMail({now:now+98*3600000,transport});await retryProofMail({now:now+147*3600000,transport});const records=await proofMailStatus(id);assert.equal(records.filter(record=>record.status==='obsolete').length,1);assert.equal(records.find(record=>record.status==='complete').sentCount,3);});

test('proof sandbox permanently blocks PF dispatch and release and sends one test invitation only',async()=>{
 const {id}=await fixture(),order=await readOrder(id);order.adminTest=true;await writeFile(join(directory,'orders',id+'.json'),JSON.stringify(order));
 const token=await invite(id),sent=[];
 await retryProofMail({transport:{sendMail:async mail=>sent.push(mail)}});
 assert.ok(sent.some(mail=>mail.subject.startsWith('[TEST]')&&mail.text.includes(token)));
 await retryProofMail({now:Date.now()+49*3600000,transport:{sendMail:async mail=>sent.push(mail)}});
 assert.equal(sent.filter(mail=>mail.text.includes(token)).length,1);
 await decideProof(id,{version:1,decision:'approve',customerToken:token});
 await assert.rejects(dispatchOrder(id),/Korrekturtesten/);
 await assert.rejects(recordApprovalDelivery(id,{channel:'E-mail',reference:'TEST'}),/Korrekturtesten/);
 await assert.rejects(recordExternalApproval(id,{pfApprovalReference:'TEST'}),/Korrekturtesten/);
 assert.equal((await readOrder(id)).status,'approval_pending_pf');
});
test('customer decisions queue receipts, retry delivery and survive a new proof without duplicate sends',async()=>{
 for(const decision of ['approve','reject']){
  const {id}=await fixture(),token=await invite(id),sent=[];
  await decideProof(id,{version:1,decision,comment:'Flyt logoet op',customerToken:token});
  const now=Date.now();
  await retryProofMail({orderIds:[id],now,transport:{sendMail:async()=>{throw Error('offline');}}});
  await recordProof(id,{proofReference:'NEXT',mimeType:'application/pdf',contentBase64:Buffer.from('%PDF-1.4\nNext').toString('base64')});
  await retryProofMail({orderIds:[id],now:now+16*60000,transport:{sendMail:async mail=>sent.push(mail)}});
  await retryProofMail({orderIds:[id],now:now+32*60000,transport:{sendMail:async mail=>sent.push(mail)}});
  assert.equal(sent.length,1);assert.equal(sent[0].from.address,'korrektur@smerch.dk');
  assert.match(sent[0].subject,decision==='approve'?/modtaget din godkendelse/:/registreret dine ændringsønsker/);
  if(decision==='reject'){assert.match(sent[0].text,/Flyt logoet op/);assert.match(sent[0].text,/snart en ny korrektur/);}
 }
});
