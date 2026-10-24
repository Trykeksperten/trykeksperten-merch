import test from 'node:test';
import assert from 'node:assert/strict';
import {customerContactData,customerContactPanel} from '../dist/admin-customer-contact.mjs';
import {checkoutPublic} from '../lib/checkout.mjs';
class Element{constructor(tag){this.tag=tag;this.children=[];this.attributes={};}append(...nodes){this.children.push(...nodes);}setAttribute(k,v){this.attributes[k]=v;}}
const all=n=>[n,...n.children.flatMap(all)];
const privateShipping={name:'Anna Jensen',email:'anna@example.test',phone:'+45 12 34 56 78',street:'Testvej 1',postalCode:'8000',city:'Aarhus',country:'DK'};
test('private contact keeps existing data and omits absent business information',()=>{
 const result=customerContactData({shipping:{address:privateShipping}},{shipping:privateShipping});
 assert.equal(result.name,'Anna Jensen');assert.equal(result.company,'');assert.equal(result.cvr,'');assert.equal(result.contact,'');assert.deepEqual(result.addresses,[{label:'Leveringsadresse',lines:['Testvej 1','8000 Aarhus','DK']}]);
});
test('business customer has CVR, explicit separate contact and distinct billing/delivery addresses',()=>{
 const checkout={shipping:{...privateShipping,company:'Eksempel ApS'},billing:{company:'Eksempel ApS',cvr:'12345678',contactPerson:'Bo Hansen',street:'Kontorvej 2',postalCode:'2100',city:'København Ø',country:'DK'}};
 const result=customerContactData({shipping:{address:privateShipping}},checkout);
 assert.equal(result.name,'Anna Jensen');assert.equal(result.company,'Eksempel ApS');assert.equal(result.cvr,'12345678');assert.equal(result.contact,'Bo Hansen');assert.deepEqual(result.addresses.map(a=>a.label),['Leveringsadresse','Faktureringsadresse']);assert.equal(result.addresses[1].lines[0],'Kontorvej 2');
 const combined=customerContactData({shipping:privateShipping},{...checkout,billing:{...privateShipping,country:'Danmark'}});assert.equal(combined.addresses.length,1);assert.equal(combined.addresses[0].label,'Fakturerings- og leveringsadresse');
});
test('contact DOM contains working phone/email links without fabricating missing fields',()=>{
 const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
 try{const panel=customerContactPanel({shipping:privateShipping});const nodes=all(panel);assert.ok(nodes.some(n=>n.href==='tel:+4512345678'));assert.ok(nodes.some(n=>n.href==='mailto:anna@example.test'));assert.ok(!nodes.some(n=>n.textContent?.startsWith('CVR:')));assert.ok(!nodes.some(n=>n.textContent?.startsWith('Kontaktperson:')));const empty=all(customerContactPanel({}));assert.ok(!empty.some(n=>n.tag==='a'));assert.ok(!empty.some(n=>n.textContent==='Danmark'));}finally{globalThis.document=previous;}
});
test('billing remains excluded from public checkout data',()=>{
 const result=checkoutPublic({id:'test',shipping:privateShipping,billing:{cvr:'12345678'},lines:[]});assert.equal(result.billing,undefined);assert.equal(result.shipping,undefined);
});
