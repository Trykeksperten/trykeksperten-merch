import {proofPdf} from './helpers/proof-pdf.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {dispatchOrder,recordApprovalDelivery,recordExternalApproval,recordProof,publishCustomerProof,customerProof,customerProofFile,decideProof,readOrder,readFeedbackFile} from '../lib/pf-orders.mjs';
import {retryProofMail,proofMailStatus,retryProofMailRecord} from '../lib/proof-mail.mjs';
import {proofQueue} from '../dist/proof-status.mjs';
const directory=await mkdtemp(join(tmpdir(),'smerch-proof-test-')),previous=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=directory;
after(async()=>{if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;await rm(directory,{recursive:true,force:true});});
const pdf=(await proofPdf('Test proof'));
async function fixture(){const id='ord-'+randomUUID(),checkoutId='pay-'+randomUUID();await mkdir(join(directory,'orders'),{recursive:true});await mkdir(join(directory,'checkouts'),{recursive:true});await writeFile(join(directory,'orders',id+'.json'),JSON.stringify({id,checkoutId,purchaseOrderNumber:'SMERCH-'+id.slice(4),status:'awaiting_proof',lines:[{productId:'pf-test',sku:'TEST',quantity:50,decorations:[{position:'Forside',width:20,height:10,colors:1}]}],events:[]}));await writeFile(join(directory,'checkouts',checkoutId+'.json'),JSON.stringify({id:checkoutId,status:'authorized',shipping:{email:'test@example.invalid'},lines:[{productId:'pf-test',sku:'TEST',productName:'Testprodukt'}]}));await recordProof(id,{proofReference:'PF-1',contentBase64:pdf.toString('base64'),mimeType:'application/pdf'});return {id,checkoutId};}
async function invite(id,version=1){const link=await publishCustomerProof(id,{version,message:'Lidt mere luft mellem bogstaverne.'});return new URLSearchParams(new URL(link.url).hash.slice(1)).get('token');}
test('personal proof link exposes only customer data and rejects invalid or expired access',async()=>{const {id}=await fixture();await assert.rejects(customerProof(id,'b'.repeat(64)));const token=await invite(id),view=await customerProof(id,token);assert.equal(view.version,1);assert.equal(view.lines[0].name,'Testprodukt');assert.equal(view.tokenHash,undefined);assert.equal(view.shipping,undefined);assert.equal(view.supplierTotal,undefined);assert.deepEqual((await customerProofFile(id,token)).data,pdf);const order=await readOrder(id);order.proof.customer.expiresAt='2000-01-01';await writeFile(join(directory,'orders',id+'.json'),JSON.stringify(order));await assert.rejects(customerProof(id,token),/udløbet/);});
test('only customer can approve a checkout proof; no payment capture or PF release occurs',async()=>{const {id,checkoutId}=await fixture(),token=await invite(id);await assert.rejects(decideProof(id,{version:1,decision:'approve'}),/Kunden skal selv/);const order=await decideProof(id,{version:1,decision:'approve',customerToken:token});assert.equal(order.status,'approval_pending_pf');assert.equal(order.decision.actor,'customer');assert.equal(order.decision.proofHash,order.proof.hash);assert.equal(JSON.parse(await readFile(join(directory,'checkouts',checkoutId+'.json'))).status,'authorized');assert.equal(proofQueue(order),'smerch');await assert.rejects(decideProof(id,{version:1,decision:'approve',customerToken:token}),/seneste/);});
test('new proof and reissued invitation revoke old tokens; concurrent old-version decisions cannot approve new files',async()=>{const {id}=await fixture(),old=await invite(id),token=await invite(id);await assert.rejects(customerProof(id,old));await recordProof(id,{proofReference:'PF-2',contentBase64:(await proofPdf('New proof')).toString('base64'),mimeType:'application/pdf'});await assert.rejects(customerProof(id,token));const next=await invite(id,2);await assert.rejects(decideProof(id,{version:1,decision:'approve',customerToken:next}),/seneste/);assert.equal((await customerProof(id,next)).version,2);});
test('customer changes require a comment and preserve validated attachments with the proof version',async()=>{const {id}=await fixture(),token=await invite(id);await assert.rejects(decideProof(id,{version:1,decision:'reject',customerToken:token}),/Skriv/);const order=await decideProof(id,{version:1,decision:'reject',comment:'Øg bogstavafstanden',customerToken:token,attachments:[{name:'rettelse.pdf',mimeType:'application/pdf',contentBase64:pdf.toString('base64')}]});assert.equal(order.status,'revision_requested');assert.equal(order.proofs[0].decision.comment,'Øg bogstavafstanden');assert.deepEqual((await readFeedbackFile(id,order.decision.attachments[0].hash)).data,pdf);});
test('uncertain proof mail needs explicit reconciliation before retry; reminders stop on answer',async()=>{const {id}=await fixture(),token=await invite(id),now=Date.now();await retryProofMail({now,transport:{sendMail:async()=>{throw Error('offline');}}});assert.equal((await proofMailStatus(id))[0].sentCount,0);const uncertain=(await proofMailStatus(id))[0];assert.equal(uncertain.status,'uncertain');await assert.rejects(retryProofMailRecord(id,uncertain.key),/Bekræft/);await retryProofMailRecord(id,uncertain.key,{confirmedNotSent:true});const sent=[];await retryProofMail({now:now+16*60000,transport:{sendMail:async mail=>sent.push(mail)}});assert.equal((await proofMailStatus(id))[0].sentCount,1);assert.ok(sent.some(mail=>mail.text.includes(token)));await retryProofMail({now:now+49*3600000,transport:{sendMail:async mail=>sent.push(mail)}});assert.equal((await proofMailStatus(id))[0].sentCount,2);await decideProof(id,{version:1,decision:'reject',comment:'Ret teksten',customerToken:token});await retryProofMail({now:now+98*3600000,transport:{sendMail:async mail=>sent.push(mail)}});assert.equal((await proofMailStatus(id))[0].status,'obsolete');});
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
  await retryProofMail({orderIds:[id],now:now+16*60000,transport:{sendMail:async mail=>sent.push(mail)}});assert.equal(sent.length,0);for(const record of (await proofMailStatus(id)).filter(r=>r.status==='uncertain'))await retryProofMailRecord(id,record.key,{confirmedNotSent:true});
  await recordProof(id,{proofReference:'NEXT',mimeType:'application/pdf',contentBase64:(await proofPdf('Next')).toString('base64')});
  await retryProofMail({orderIds:[id],now:now+16*60000,transport:{sendMail:async mail=>sent.push(mail)}});
  await retryProofMail({orderIds:[id],now:now+32*60000,transport:{sendMail:async mail=>sent.push(mail)}});
  assert.equal(sent.length,2);const internal=sent.find(mail=>mail.to==='korrektur@smerch.dk');assert.ok(internal);assert.match(internal.text,new RegExp('/admin/pf-orders#order='+id));assert.match(internal.subject,decision==='approve'?/Kunden har godkendt/:/Kunden ønsker ændringer/);assert.match(internal.text,/Flyt logoet op/);assert.ok(!internal.text.includes(token));assert.match(internal.text,/ingen hævning/);sent.sort((a,b)=>Number(a.to==='korrektur@smerch.dk')-Number(b.to==='korrektur@smerch.dk'));assert.equal(sent[0].from.address,'korrektur@smerch.dk');
  assert.match(sent[0].subject,decision==='approve'?/modtaget din godkendelse/:/registreret dine ændringsønsker/);
  if(decision==='reject'){assert.match(sent[0].text,/Flyt logoet op/);assert.match(sent[0].text,/snart en ny korrektur/);}
 }
});

test('production approval uses an unexpired reservation; capture waits for full shipment',async()=>{
 const {checkoutReadyForCapture}=await import('../lib/order-flow.mjs');
 const {id,checkoutId}=await fixture(),token=await invite(id);
 await decideProof(id,{version:1,decision:'approve',customerToken:token});
 const path=join(directory,'checkouts',checkoutId+'.json'),checkout=JSON.parse(await readFile(path));
 checkout.authorizationExpiresAt=new Date(Date.now()+86400000).toISOString();checkout.pfOrderIds=[id];checkout.fulfillment={groups:[{}]};checkout.lines=[{decorations:[{method:'Broderi fixed'}]}];await writeFile(path,JSON.stringify(checkout));
 assert.equal(await checkoutReadyForCapture(checkout),false);
 await recordApprovalDelivery(id,{channel:'E-mail',reference:'proof-approved'});
 await recordExternalApproval(id,{pfApprovalReference:'PF-accepted'});
 assert.equal(JSON.parse(await readFile(path)).status,'authorized');
 const pf=await readOrder(id);pf.pfOrderNumber='123';pf.status='partially_shipped';pf.shipment={shipDate:new Date().toISOString(),isOrderComplete:false};await writeFile(join(directory,'orders',id+'.json'),JSON.stringify(pf));
 assert.equal(await checkoutReadyForCapture(checkout),false);
 pf.status='shipped';pf.shipment.isOrderComplete=true;await writeFile(join(directory,'orders',id+'.json'),JSON.stringify(pf));assert.equal(await checkoutReadyForCapture(checkout),true);
});
test('expired reservation cannot release a proof to production',async()=>{
 const {id,checkoutId}=await fixture(),token=await invite(id);await decideProof(id,{version:1,decision:'approve',customerToken:token});
 const path=join(directory,'checkouts',checkoutId+'.json'),checkout=JSON.parse(await readFile(path));checkout.authorizationExpiresAt='2000-01-01';await writeFile(path,JSON.stringify(checkout));
 await assert.rejects(recordApprovalDelivery(id,{channel:'E-mail',reference:'x'}),/reservation/);
 await assert.rejects(recordExternalApproval(id,{pfApprovalReference:'x'}),/reservation/);
});
test('invalid and empty PDFs cannot replace an existing proof or its decision',async()=>{
 const {PDFDocument}=await import('pdf-lib');const {id}=await fixture();const before=await readOrder(id);
 for(const bytes of [Buffer.from('%PDF-1.4\nTEST - no production'),Buffer.from(await(await PDFDocument.create()).save({addDefaultPage:false}))]){
  await assert.rejects(recordProof(id,{proofReference:'BROKEN',mimeType:'application/pdf',contentBase64:bytes.toString('base64')}),/PDF-korrekturen kan ikke læses/);
  assert.deepEqual(await readOrder(id),before);
 }
});
