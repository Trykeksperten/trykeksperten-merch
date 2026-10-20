import test from 'node:test';
import assert from 'node:assert/strict';
import {proofMailConfiguration,proofMailMessage} from '../lib/proof-mail.mjs';
test('proof mail requires its own password and uses proof mailbox for sender and replies',()=>{
 assert.equal(proofMailConfiguration({CONTACT_SMTP_PASSWORD:'hello-secret'}).ready,false);
 const config=proofMailConfiguration({PROOF_SMTP_PASSWORD:'proof-secret',CONTACT_SMTP_USER:'hello@smerch.dk',CONTACT_SMTP_PASSWORD:'hello-secret'});
 assert.equal(config.ready,true);assert.equal(config.password,'proof-secret');
 for(const sentCount of [0,1]){const mail=proofMailMessage({to:'test@example.invalid',reference:'TEST',version:1,url:'https://smerch.dk/korrektur',sentCount},config);assert.equal(mail.from.address,'korrektur@smerch.dk');assert.equal(mail.replyTo.address,'korrektur@smerch.dk');assert.match(mail.text,/Kontakt korrektur@smerch.dk/);}
});
