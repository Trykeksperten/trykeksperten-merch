import {publishCustomerProof,decideProof,readOrder} from '../lib/pf-orders.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {randomUUID,randomBytes,scryptSync} from 'node:crypto';
import {adminSessionActor,createAdminSession,closeAdminSession} from '../lib/admin-auth.mjs';
import {addCorrespondence,readCorrespondence} from '../lib/order-correspondence.mjs';
import {queueProofMail,proofMailStatus,retryProofMail} from '../lib/proof-mail.mjs';
import {actorLabel,mailActivity,proofActionLabel} from '../dist/admin-activity.mjs';
const dir=await mkdtemp(join(tmpdir(),'smerch-actors-')),previous=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=dir;
after(async()=>{if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;await rm(dir,{recursive:true,force:true});});
const actor={type:'staff',name:'staff@example.test'};
test('staff identity comes from authenticated session and is revoked on logout',()=>{
 const salt=randomBytes(16).toString('hex'),password='local-test-password',env={NODE_ENV:'production',SMERCH_ADMIN_USERNAME:actor.name,SMERCH_ADMIN_PASSWORD_HASH:salt+':'+scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex')};
 const req={method:'POST',headers:{host:'test.invalid',origin:'https://test.invalid','x-smerch-admin':'1'},socket:{remoteAddress:'activity-test'}},headers={},res={setHeader:(key,value)=>headers[key]=value};
 assert.equal(adminSessionActor(req),null);assert.equal(createAdminSession(req,res,{username:actor.name,password},env),true);req.headers.cookie=headers['Set-Cookie'].split(';')[0];assert.deepEqual(adminSessionActor(req),actor);assert.equal(adminSessionActor({...req,headers:{...req.headers,'x-smerch-admin':undefined}}),null);closeAdminSession(req,res);assert.equal(adminSessionActor(req),null);
});
test('notes and emails store trusted initiator separately from actual sender and recipient',async()=>{
 const order={id:'ord-'+randomUUID(),shipping:{email:'customer@example.test'}},requestId=randomUUID();
 const note=await addCorrespondence(order,{kind:'note',text:'Test note',requestId,initiatedBy:{type:'staff',name:'spoof'}},{initiatedBy:actor});assert.deepEqual(note.initiatedBy,actor);
 await addCorrespondence(order,{kind:'note',text:'Test note',requestId},{initiatedBy:{type:'staff',name:'another'}});assert.equal((await readCorrespondence(order.id)).length,1);assert.deepEqual((await readCorrespondence(order.id))[0].initiatedBy,actor);
 const mail=await addCorrespondence(order,{kind:'email',text:'Hello',subject:'Test',requestId:randomUUID()},{initiatedBy:actor,env:{CONTACT_SMTP_USER:'sender@example.test'},transport:{sendMail:async()=>({accepted:['customer@example.test']})}});assert.equal(mail.sentBy.email,'sender@example.test');assert.equal(mail.to,'customer@example.test');assert.deepEqual(mail.initiatedBy,actor);
});
test('proof status exposes attribution without leaking customer access token',async()=>{
 const id='ord-'+randomUUID(),tokenHash='a'.repeat(64);await queueProofMail({id,version:1,kind:'receipt',tokenHash:'receipt',to:'customer@example.test',initiatedBy:actor});const row=(await proofMailStatus(id))[0];assert.deepEqual(row.initiatedBy,actor);assert.equal(row.url,undefined);assert.equal(row.tokenHash,undefined);
});
test('history names parties explicitly and never guesses historical sender',()=>{
 assert.equal(actorLabel(null),'Ikke registreret');const old=mailActivity({proof:true,kind:'staff_decision',to:'korrektur@smerch.dk',sentCount:1});assert.ok(old.includes('Afsender: Ikke registreret'));assert.ok(old.includes('Modtager: korrektur@smerch.dk'));assert.equal(proofActionLabel('staff_decision'),'Intern besked om kundens korrektursvar');assert.equal(proofActionLabel('receipt'),'Bekræftelse på kundens korrektursvar');assert.ok(mailActivity({initiatedBy:actor,proof:true,sentCount:3}).includes('Automatiske påmindelser sendt: 2'));
});

test('manual invitation, customer response and automatic sender keep separate identities',async()=>{
 const id='ord-'+randomUUID(),checkoutId='pay-'+randomUUID();await mkdir(join(dir,'orders'),{recursive:true});await mkdir(join(dir,'checkouts'),{recursive:true});
 const proof={version:1,mimeType:'application/pdf',hash:'test',reference:'PF-test'};
 await writeFile(join(dir,'orders',id+'.json'),JSON.stringify({id,checkoutId,status:'proof_received',purchaseOrderNumber:'TEST',proof,proofs:[proof],events:[],shipping:{email:'customer@example.test'}}));
 await writeFile(join(dir,'checkouts',checkoutId+'.json'),JSON.stringify({id:checkoutId,status:'authorized',shipping:{name:'Test Customer',email:'customer@example.test'}}));
 const invite=await publishCustomerProof(id,{version:1,initiatedBy:actor}),token=new URLSearchParams(new URL(invite.url).hash.slice(1)).get('token');
 assert.deepEqual((await proofMailStatus(id))[0].initiatedBy,actor);
 await retryProofMail({orderIds:[id],env:{PROOF_SMTP_USER:'korrektur@smerch.dk'},transport:{sendMail:async mail=>({accepted:[mail.to]})}});
 assert.equal((await proofMailStatus(id))[0].sentBy.email,'korrektur@smerch.dk');
 await decideProof(id,{version:1,decision:'approve',customerToken:token,performedBy:{type:'staff',name:'forged'}});
 const decision=(await readOrder(id)).decision;assert.equal(decision.performedBy.type,'customer');assert.equal(decision.performedBy.email,'customer@example.test');
 const mails=await proofMailStatus(id);for(const mail of mails.filter(m=>['receipt','staff_decision'].includes(m.kind)))assert.deepEqual(mail.initiatedBy,decision.performedBy);
 assert.equal(mails.find(m=>m.kind==='staff_decision').to,'korrektur@smerch.dk');
});

