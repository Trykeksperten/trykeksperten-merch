import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkoutMarketingHTML,checkoutMarketingInput} from '../dist/checkout-marketing.mjs';
import {MARKETING_VERSION,marketingConsent} from '../dist/legal-consent.mjs';
import {recordCheckoutMarketing} from '../lib/checkout-marketing.mjs';
import {listMarketing,unsubscribeMarketing} from '../lib/legal-services.mjs';
const order=()=>({id:'pay-demo',shipping:{email:' Kunde@example.dk '},legal:{locale:'da'}});
test('checkout opt-in is unchecked, optional, email-specific and separate from required terms',async()=>{
 const html=checkoutMarketingHTML();assert.match(html,/name="marketingEmail"/);assert.doesNotMatch(html,/\b(?:checked|required)\b/);assert.match(html,/Valgfrit/);assert.match(html,/afmelde dig gratis/);assert.match(html,/Trykeksperten ApS/);assert.match(html,/via e-mail/);assert.match(checkoutMarketingHTML('en'),/Optional/);
 const source=await readFile(new URL('../dist/checkout.mjs',import.meta.url),'utf8');assert.ok(source.indexOf('checkoutMarketingHTML(getLanguage())')<source.indexOf('Bestil med betalingspligt'));assert.match(source,/marketing:checkoutMarketingInput/);
});
test('no opt-in and truthy strings never enroll; an actual opt-in stores evidence in customer list and checkout',async()=>{
 const base=await mkdtemp(join(tmpdir(),'smerch-marketing-test-'));try{
  for(const input of [undefined,{},checkoutMarketingInput(false),{email:'true'}])assert.equal(await recordCheckoutMarketing(order(),input,{base}),null);
  assert.deepEqual(await listMarketing({base}),[]);
  const o=order();const consent=await recordCheckoutMarketing(o,checkoutMarketingInput(true),{base,now:1000});assert.equal(consent.address,'kunde@example.dk');assert.equal(consent.text,marketingConsent.da.email);assert.equal(o.marketingConsent.acceptedAt,'1970-01-01T00:00:01.000Z');
  const [record]=await listMarketing({base});assert.equal(record.active,true);assert.equal(record.events[0].source,'/checkout');assert.equal(record.events[0].version,MARKETING_VERSION);assert.equal(record.events[0].orderReference,o.id);assert.equal(record.channel,'email');
  await recordCheckoutMarketing(o,checkoutMarketingInput(true),{base,now:2000});assert.equal((await listMarketing({base}))[0].events.length,1);
  await unsubscribeMarketing({emailAddress:consent.address},{base,now:3000});await recordCheckoutMarketing(o,checkoutMarketingInput(true),{base,now:4000});assert.equal((await listMarketing({base}))[0].active,false);
 }finally{await rm(base,{recursive:true,force:true});}
});
test('invalid consent and test flows cannot create subscriptions; trusted checkout supplies address and language',async()=>{
 const base=await mkdtemp(join(tmpdir(),'smerch-marketing-test-'));try{
  await assert.rejects(recordCheckoutMarketing(order(),{email:true,version:'old'},{base}));await assert.rejects(recordCheckoutMarketing({...order(),shipping:{}},checkoutMarketingInput(true),{base}));
  for(const flag of ['adminTest','adminPilot','adminLiveTest'])assert.equal(await recordCheckoutMarketing({...order(),[flag]:true},checkoutMarketingInput(true),{base}),null);
  assert.deepEqual(await listMarketing({base}),[]);const o={...order(),legal:{locale:'en'}};await recordCheckoutMarketing(o,{...checkoutMarketingInput(true),locale:'da',emailAddress:'other@example.dk',sms:true},{base});const [r]=await listMarketing({base});assert.equal(r.address,'kunde@example.dk');assert.equal(r.events[0].text,marketingConsent.en.email);assert.equal(r.channel,'email');
 }finally{await rm(base,{recursive:true,force:true});}
});
