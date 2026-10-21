import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {queueOrderConfirmation} from '../lib/order-mail.mjs';
const root=await mkdtemp(join(tmpdir(),'smerch-confirmation-')),previous=process.env.SMERCH_DATA_DIR;process.env.SMERCH_DATA_DIR=root;
after(async()=>{if(previous===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=previous;await rm(root,{recursive:true,force:true});});
test('personalised order confirmation explains review and customer approval before production in both languages',async()=>{
 for(const locale of ['da','en']){const order={id:'pay-'+randomUUID(),status:'authorized',legal:{documents:{terms:'Terms',privacy:'Privacy'},locale},totalIncVat:12500,shipping:{name:'Test',email:'test@example.invalid',street:'Testvej 1',postalCode:'2300',city:'København S',country:'DK'},lines:[{quantity:1,productId:'pf-test',sku:'TEST',decorations:[{}]}]};await queueOrderConfirmation(order);const record=JSON.parse(await readFile(join(root,'order-mail',order.id+'.json'),'utf8'));assert.match(record.text,locale==='da'?/Vi gennemgår nu din ordre/:/We are now reviewing your order/);assert.match(record.text,locale==='da'?/Først når du har godkendt/:/only start after you approve/);assert.equal(record.status,'pending');assert.equal(record.text.includes('samlet'),false);}
});

test('customer confirmation uses sale amounts and never sends supplier documents or costs',async()=>{
 const {retryOrderConfirmations,confirmationHTML}=await import('../lib/order-mail.mjs');
 const order={id:'pay-'+randomUUID(),createdAt:'2026-10-21T12:00:00Z',status:'authorized',legal:{locale:'da',documents:{terms:'Terms'}},shipping:{name:'<script>Test</script>',email:'test@example.invalid'},lines:[{quantity:2,productId:'pf-test',sku:'TEST',supplierUnitPrice:999999,decorations:[]}],quote:{lines:[{totalIncVat:12500}],vat:2500},freightIncVat:18750,freightExVat:15000,totalIncVat:31250,supplierTotal:'SECRET_COST',pfConfirmation:{content:'SECRET_PDF'}};
 await queueOrderConfirmation(order);const record=JSON.parse(await readFile(join(root,'order-mail',order.id+'.json'),'utf8'));
 const html=confirmationHTML(record);assert.match(html,/125,00/);assert.match(html,/187,50/);assert.match(html,/312,50/);assert.match(html,/62,50/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|SECRET_|999999/);assert.doesNotMatch(JSON.stringify(record),/SECRET_|supplierUnitPrice/);
 let sent;await retryOrderConfirmations({transport:{sendMail:async message=>{if(message.to===order.shipping.email&&message.text.includes(order.id))sent=message;}}});assert.ok(sent);assert.ok(sent.attachments.some(a=>a.filename==='smerch-order-confirmation.html'));assert.ok(sent.attachments.every(a=>!a.filename.startsWith('PFC_')));
});
