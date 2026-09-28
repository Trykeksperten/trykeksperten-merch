import test from 'node:test';
import assert from 'node:assert/strict';
import {contactConfiguration,sanitizeContact,sendContact} from '../lib/contact.mjs';

test('contact form validates and limits public input',()=>{
 assert.throws(()=>sanitizeContact({}),/navn/);
 assert.throws(()=>sanitizeContact({name:'Test',email:'forkert',subject:'Andet',message:'En tilstrækkelig besked'}),/e-mailadresse/);
 const inquiry=sanitizeContact({name:'  Joakim  ',company:'Smerch',email:'JOAKIM@EXAMPLE.DK',phone:'12 34 56 78',subject:'Merchandise',message:'Hej\r\nJeg vil gerne høre mere.',website:''});
 assert.deepEqual(inquiry,{name:'Joakim',company:'Smerch',email:'joakim@example.dk',phone:'12 34 56 78',subject:'Merchandise',message:'Hej\nJeg vil gerne høre mere.',website:''});
});

test('contact email goes only to the configured Smerch inbox with safe reply-to',async()=>{
 const inquiry=sanitizeContact({name:'Joakim <script>',company:'Smerch',email:'joakim@example.dk',subject:'Andet',message:'Dette er en testbesked.'}),sent=[];
 const env={CONTACT_SMTP_PASSWORD:'secret',CONTACT_SMTP_USER:'hello@smerch.dk',CONTACT_TO_EMAIL:'hello@smerch.dk'};
 assert.equal(contactConfiguration(env).ready,true);
 await sendContact(inquiry,{env,transport:{sendMail:async message=>{sent.push(message);return {messageId:'test'};}}});
 assert.equal(sent[0].to,'hello@smerch.dk');
 assert.deepEqual(sent[0].replyTo,{name:'Joakim <script>',address:'joakim@example.dk'});
 assert.ok(sent[0].html.includes('Joakim &lt;script&gt;'));
 assert.ok(!sent[0].html.includes('<script>'));
});
