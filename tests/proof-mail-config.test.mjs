import test from 'node:test';
import assert from 'node:assert/strict';
import {proofMailConfiguration,proofMailMessage} from '../lib/proof-mail.mjs';
import nodemailer from 'nodemailer';
import {simpleParser} from 'mailparser';
test('proof mail requires its own password and uses proof mailbox for sender and replies',()=>{
 assert.equal(proofMailConfiguration({CONTACT_SMTP_PASSWORD:'hello-secret'}).ready,false);
 const config=proofMailConfiguration({PROOF_SMTP_PASSWORD:'proof-secret',CONTACT_SMTP_USER:'hello@smerch.dk',CONTACT_SMTP_PASSWORD:'hello-secret'});
 assert.equal(config.ready,true);assert.equal(config.password,'proof-secret');
 for(const sentCount of [0,1]){const mail=proofMailMessage({to:'test@example.invalid',reference:'TEST',version:1,url:'https://smerch.dk/korrektur',sentCount},config);assert.equal(mail.from.address,'korrektur@smerch.dk');assert.equal(mail.replyTo.address,'korrektur@smerch.dk');assert.match(mail.text,/Kontakt korrektur@smerch.dk/);}
});
test('staff order links use the API/admin origin, never the separate customer host',async()=>{
 const record={kind:'staff_decision',id:'ord-test /#æ',decision:'approve',reference:'LOCAL',version:1};
 for(const base of ['https://local-mail-test.invalid/path?old=1#old','http://127.0.0.1:5187']){
  const config=proofMailConfiguration({SMERCH_PUBLIC_BASE_URL:base,SMERCH_CUSTOMER_BASE_URL:'https://other-shop.invalid'});
  const message=proofMailMessage(record,config),expected=new URL(base).origin+'/admin/pf-orders#order='+encodeURIComponent(record.id);
  assert.ok(message.text.includes(expected));assert.doesNotMatch(message.text,/https:\/\/smerch\.dk\/admin|other-shop\.invalid|old=1/);
  // Build and parse the actual MIME message entirely in memory: no SMTP/network.
  const result=await nodemailer.createTransport({streamTransport:true,buffer:true}).sendMail(message);
  const parsed=await simpleParser(result.message);assert.ok(parsed.text.includes(expected));
 }
});
test('an invalid explicit admin URL cannot silently link staff to production',()=>{
 for(const base of ['', 'invalid','javascript:alert(1)','file:///tmp/order','https://user:secret@local.invalid']){
  const config=proofMailConfiguration({SMERCH_PUBLIC_BASE_URL:base});
  assert.throws(()=>proofMailMessage({kind:'staff_decision',id:'ord-test'},config));
 }
});
test('internal decision notification goes only to proof inbox with staff order link and attachment notice',()=>{
 const message=proofMailMessage({kind:'staff_decision',id:'ord-123',to:'customer@example.invalid',customerEmail:'customer@example.invalid',decision:'reject',reference:'SMERCH-123',pfOrderNumber:'7886901',proofReference:'PF-proof',version:2,decisionAt:'2026-10-23T14:00:00Z',comment:'Flyt logo',attachmentCount:1,adminTest:true},{user:'korrektur@smerch.dk'});
 assert.equal(message.to,'korrektur@smerch.dk');assert.equal(message.replyTo,'customer@example.invalid');
 assert.match(message.subject,/^\[TEST\].*ændringer.*7886901/);
 assert.match(message.text,/https:\/\/smerch.dk\/admin\/pf-orders#order=ord-123/);
 assert.match(message.text,/1 bilag/);assert.match(message.text,/version 2/);assert.match(message.text,/Ændringsønsker udløser ingen hævning/);assert.doesNotMatch(message.text,/først hæves ved afsendelse/);
});
