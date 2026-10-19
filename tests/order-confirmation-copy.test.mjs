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
