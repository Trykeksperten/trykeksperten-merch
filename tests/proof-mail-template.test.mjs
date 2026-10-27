import test from 'node:test';
import assert from 'node:assert/strict';
import {proofMailMessage} from '../lib/proof-mail.mjs';
const config={user:'korrektur@smerch.dk'},mail={to:'demo@example.test',reference:'SMERCH-DEMO',orderNumber:'DEMO-ORDER',customerName:'Demo',version:2,url:'https://smerch.dk/korrektur#order=demo&token=example'};
test('invitation has Smerch branding, matching plain text, checklist and a personal CTA',()=>{
 const m=proofMailMessage(mail,config);assert.equal(m.to,mail.to);assert.equal(m.from.address,config.user);assert.equal(m.replyTo.address,config.user);
 assert.match(m.html,/Korrektur til godkendelse/);assert.match(m.html,/Ordre DEMO-ORDER/);assert.match(m.html,/Version 2/);assert.match(m.html,/Se og godkend korrektur/);assert.match(m.html,/Godkend til produktion/);assert.match(m.html,/Bed om ændringer/);assert.match(m.html,/Trykplacering og mål/);assert.match(m.html,/30 dage/);
 assert.ok(m.html.includes('href="https://smerch.dk/korrektur#order=demo&amp;token=example"'));
 assert.equal(m.attachments.length,1);assert.equal(m.attachments[0].cid,'smerch-proof-logo@smerch.dk');assert.equal(m.attachments[0].content.subarray(1,4).toString(),'PNG');assert.equal(m.disableFileAccess,true);assert.equal(m.disableUrlAccess,true);
 for(const excluded of [/etiketter/i,/separat pakning/i,/opdelt levering/i,/2.?4 timer/i,/PF Concept/i]){assert.doesNotMatch(m.html,excluded);assert.doesNotMatch(m.text,excluded);}
 assert.ok(m.text.includes(mail.url));assert.match(m.text,/Trykplacering|trykplacering/);
});
test('customer content is escaped and arbitrary non-HTTPS links are rejected',()=>{
 const m=proofMailMessage({...mail,customerName:'<img onerror="x">',message:'<script>bad()</script>\nNote',orderNumber:'A&B'},config);
 assert.doesNotMatch(m.html,/<script>bad/);assert.match(m.html,/&lt;script&gt;bad/);assert.match(m.html,/A&amp;B/);assert.match(m.html,/<br>Note/);assert.throws(()=>proofMailMessage({...mail,url:'javascript:alert(1)'},config),/HTTPS/);
});
test('reminders use the same complete branded template without changing customer decisions',()=>{
 const reminder=proofMailMessage({...mail,sentCount:1},config);assert.match(reminder.subject,/Påmindelse/);assert.match(reminder.html,/Se og godkend korrektur/);
 const internal=proofMailMessage({...mail,kind:'staff_decision',decision:'approve'},config);assert.equal(internal.to,'korrektur@smerch.dk');assert.match(internal.text,/ingen hævning/);
});

test('staff and customer receipts respect internal review and agreed payment timing',()=>{
 const internal=proofMailMessage({...mail,kind:'staff_decision',decision:'approve'},config);
 assert.match(internal.text,/betalingen være bekræftet.*før svaret sendes til PF/);assert.match(internal.text,/Ældre ordrer følger deres oprindelige vilkår/);assert.doesNotMatch(internal.text,/først hæves ved afsendelse/);
 const receipt=proofMailMessage({...mail,kind:'receipt',decision:'approve'},config);
 assert.match(receipt.text,/gennemgår nu din godkendelse hos Smerch/);assert.match(receipt.html,/vilkår, du accepterede ved bestillingen/);
 const invitation=proofMailMessage(mail,config);assert.match(invitation.text,/Smerchs interne godkendelse/);assert.match(invitation.html,/vilkårene i din ordrebekræftelse/);
});
