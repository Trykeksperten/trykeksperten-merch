import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeSpecial,sendSpecial} from '../lib/special-inquiry.mjs';
const input={customerType:'private',name:'Test',email:'test@example.com',quantity:'19',description:'En specialproduceret taske',attachments:[{name:'tegning.pdf',type:'application/pdf',data:Buffer.from('%PDF-1.4\nTest').toString('base64')}]};
test('special inquiry sends actual attachment bytes to fixed inbox with reply-to',async()=>{
 const inquiry=sanitizeSpecial({...input,to:'other@example.com',budget:'2500',deadline:'2026-12-01'});let mail;
 await sendSpecial(inquiry,{env:{CONTACT_SMTP_PASSWORD:'test',CONTACT_TO_EMAIL:'other@example.com'},transport:{sendMail:async value=>{mail=value;}}});
 assert.equal(mail.to,'hello@smerch.dk');assert.equal(mail.replyTo.address,input.email);
 assert.match(mail.text,/Ønsket antal: 19/);assert.match(mail.text,/2500/);assert.match(mail.text,/2026-12-01/);
 assert.equal(mail.attachments[0].filename,'tegning.pdf');assert.deepEqual(mail.attachments[0].content,Buffer.from('%PDF-1.4\nTest'));
 assert.equal(mail.disableFileAccess,true);assert.equal(mail.disableUrlAccess,true);
});
test('special inquiry rejects invalid fields, excess, spoofed and oversized files',()=>{
 assert.throws(()=>sanitizeSpecial({...input,quantity:0}),/antal/);
 assert.throws(()=>sanitizeSpecial({...input,email:'invalid'}),/e-mail/);
 assert.throws(()=>sanitizeSpecial({...input,attachments:Array(4).fill(input.attachments[0])}),/3 filer/);
 assert.throws(()=>sanitizeSpecial({...input,attachments:[{...input.attachments[0],type:'image/png'}]}),/gyldige/);
 assert.throws(()=>sanitizeSpecial({...input,attachments:[{...input.attachments[0],data:Buffer.alloc(5*1024*1024+1).toString('base64')}]}),/stor|5 MB/);
 assert.deepEqual(sanitizeSpecial({...input,attachments:[]}).attachments,[]);
});
test('mail failure is propagated instead of confirming delivery',async()=>{
 await assert.rejects(sendSpecial(sanitizeSpecial(input),{env:{CONTACT_SMTP_PASSWORD:'test'},transport:{sendMail:async()=>{throw Error('SMTP unavailable');}}}),/SMTP unavailable/);
});
