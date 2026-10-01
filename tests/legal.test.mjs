import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LEGAL_VERSION,MARKETING_VERSION,validateCheckoutConsent,marketingConsent} from '../dist/legal-consent.mjs';
import {validateMarketing,subscribeMarketing,unsubscribeMarketing,listMarketing,recordWithdrawal,listWithdrawals,deliverWithdrawalReceipt} from '../lib/legal-services.mjs';
import {legalPage} from '../lib/legal-pages.mjs';
const consent={version:LEGAL_VERSION,accepted:true,customerType:'consumer',locale:'da',prepayment:true,personalised:true};
test('checkout requires current terms, actual boolean choices and separate prepayment acceptance',()=>{
 assert.equal(validateCheckoutConsent(consent,0).acceptedAt,'1970-01-01T00:00:00.000Z');
 for(const patch of [{accepted:'true'},{version:'old'},{prepayment:false},{personalised:false},{customerType:'other'},{locale:'xx'}])assert.throws(()=>validateCheckoutConsent({...consent,...patch}));
 assert.equal(validateCheckoutConsent({...consent,customerType:'business',locale:'en'}).customerType,'business');
});
test('marketing cannot be inferred from contact fields, truthy strings, or terms acceptance',()=>{
 for(const input of [{emailAddress:'test@example.dk'},{version:MARKETING_VERSION,ownDetails:true,email:'true',emailAddress:'test@example.dk'},{version:MARKETING_VERSION,ownDetails:false,email:true,emailAddress:'test@example.dk'}])assert.throws(()=>validateMarketing(input));
 const result=validateMarketing({version:MARKETING_VERSION,ownDetails:true,email:true,sms:false,emailAddress:' TEST@example.dk ',phone:'invalid',locale:'en'});
 assert.deepEqual(result,[{channel:'email',address:'test@example.dk',locale:'en',text:marketingConsent.en.email}]);
});
test('channel-specific consent, withdrawal and explicit re-subscription retain evidence',async()=>{
 const base=await mkdtemp(join(tmpdir(),'smerch-legal-'));
 try{const input={version:MARKETING_VERSION,ownDetails:true,email:true,sms:true,emailAddress:'test@example.dk',phone:'27 82 22 77'};
 await subscribeMarketing(input,{base,now:1});let list=await listMarketing({base});assert.equal(list.length,2);assert.ok(list.every(x=>x.active));assert.equal(list.find(x=>x.channel==='sms').address,'+4527822277');
 await unsubscribeMarketing({emailAddress:'TEST@example.dk'},{base,now:2});list=await listMarketing({base});assert.equal(list.find(x=>x.channel==='email').active,false);assert.equal(list.find(x=>x.channel==='sms').active,true);
 assert.deepEqual(await unsubscribeMarketing({emailAddress:'unknown@example.dk'},{base}),{saved:true});
 await subscribeMarketing({...input,sms:false},{base,now:3});list=await listMarketing({base});const record=list.find(x=>x.channel==='email');assert.equal(record.active,true);assert.deepEqual(record.events.map(x=>x.type),['consent','withdrawal','consent']);assert.equal(record.events[0].text,marketingConsent.da.email);
 }finally{await rm(base,{recursive:true,force:true});}
});
test('simultaneous subscribe and unsubscribe cannot lose the later withdrawal',async()=>{
 const base=await mkdtemp(join(tmpdir(),'smerch-consent-race-'));try{await Promise.all([subscribeMarketing({version:MARKETING_VERSION,ownDetails:true,email:true,emailAddress:'race@example.dk'},{base}),unsubscribeMarketing({emailAddress:'race@example.dk'},{base})]);assert.equal((await listMarketing({base}))[0].active,false);}finally{await rm(base,{recursive:true,force:true});}
});
test('withdrawal needs confirmation, records receipt independently of SMTP and queues a durable copy',async()=>{
 const base=await mkdtemp(join(tmpdir(),'smerch-withdrawal-'));try{
 const input={name:'Test',email:'test@example.dk',orderReference:'test-order',confirmed:true,locale:'en'};
 await assert.rejects(recordWithdrawal({...input,confirmed:false},{base}));
 const receipt=await recordWithdrawal(input,{base,now:1000});assert.match(receipt.receipt,/1970-01-01T00:00:01.000Z/);assert.match(receipt.receipt,/test-order/);
 assert.equal(await deliverWithdrawalReceipt(receipt,{base,env:{}}),false);assert.equal((await listWithdrawals({base}))[0].emailStatus,'pending');
 let message;await deliverWithdrawalReceipt(receipt,{base,env:{},transport:{sendMail:async input=>{message=input;}}});assert.equal(message.to,'test@example.dk');assert.match(message.text,/I hereby withdraw/);assert.equal((await listWithdrawals({base}))[0].emailStatus,'sent');
 }finally{await rm(base,{recursive:true,force:true});}
});
test('published policy pages have no draft notes and forms do not preselect consent',async()=>{
 for(const lang of ['da','en'])for(const path of ['/handelsbetingelser','/privatlivspolitik','/fortryd-aftale','/marketing']){
 const html=await legalPage(path,new URLSearchParams({lang}));assert.match(html,new RegExp(`<html lang="${lang}">`));assert.doesNotMatch(html,/INTERN NOTE|AFKLARES FØR|class="pending"|type="checkbox"[^>]*checked/);assert.match(html,/hello@smerch.dk/);
 }
 const unsubscribe=await legalPage('/marketing',new URLSearchParams('mode=unsubscribe&lang=en'));assert.match(unsubscribe,/data-legal-form="unsubscribe"/);assert.doesNotMatch(unsubscribe,/name="ownDetails"/);
});
test('consumer rights and business-only restrictions stay distinct in both policy versions',async()=>{
 const da=await readFile(new URL('../dist/legal/terms-da.html',import.meta.url),'utf8'),en=await readFile(new URL('../dist/legal/terms-en.html',import.meta.url),'utf8');
 assert.ok(da.indexOf('otte dage efter levering')>da.indexOf('13. Særligt for erhvervskøb'));assert.ok(en.indexOf('within eight days of delivery')>en.indexOf('13. Business purchases only'));
 assert.match(da,/to måneder er altid rettidig/);assert.match(en,/within two months is always timely/);assert.match(da,/fortryd-aftale/);assert.match(en,/fortryd-aftale\?lang=en/);
});
test('order confirmation is queued once and includes the accepted document snapshots',async()=>{
 const {queueOrderConfirmation,retryOrderConfirmations}=await import('../lib/order-mail.mjs');
 const base=await mkdtemp(join(tmpdir(),'smerch-order-mail-')),previous=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=base;
 try{const order={id:'pay-11111111-1111-4111-8111-111111111111',status:'authorized',totalIncVat:10000,lines:[{productId:'test',sku:'test-sku',quantity:10}],shipping:{name:'Test',email:'test@example.invalid',street:'Test 1',postalCode:'1000',city:'Test',country:'DK'},legal:{locale:'en',prepaymentText:'Separate acceptance',deliveryTerms:'Agreed delivery',documents:{terms:'<h1>Accepted terms</h1>',privacy:'<h1>Accepted privacy</h1>'}}};
 await Promise.all([queueOrderConfirmation(order),queueOrderConfirmation(order)]);let messages=[];
 await retryOrderConfirmations({env:{},transport:{sendMail:async message=>messages.push(message)}});
 await retryOrderConfirmations({env:{},transport:{sendMail:async message=>messages.push(message)}});
 assert.equal(messages.length,1);assert.equal(messages[0].to,'test@example.invalid');assert.equal(messages[0].attachments.length,2);assert.match(messages[0].attachments[0].content,/Accepted terms/);assert.match(messages[0].text,/Separate acceptance/);assert.match(messages[0].text,/Agreed delivery/);
 }finally{if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;await rm(base,{recursive:true,force:true});}
});
