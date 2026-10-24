import test from 'node:test';
import assert from 'node:assert/strict';
import {appendOrderSummaryInfo,appendOrderSummaryState} from '../dist/admin-order-summary.mjs';
class Element{constructor(tag){this.tag=tag;this.children=[];}append(...nodes){this.children.push(...nodes);}}
const all=node=>[node,...node.children.flatMap(all)];
test('order summaries show number, company and contact, products, destination, gross total and payment/production/proof states',()=>{const before=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};try{
 const checkout={createdAt:'2026-10-23T12:52:00Z',totalIncVat:124613,status:'authorized',billing:{company:'Eksempel ApS'},shipping:{name:'Bo Hansen',email:'bo@example.test',phone:'+45 12 34 56 78',postalCode:'2300',city:'København S'},productNames:{cap:'Kasket'},lines:[{productId:'cap',sku:'38687070',quantity:10}]},orders=[{pfOrderNumber:'7886901',status:'approval_recorded',proof:{version:1},decision:{decision:'approve'}}],info=new Element('div'),state=new Element('div');
 appendOrderSummaryInfo(info,{checkout,orders});appendOrderSummaryState(state,checkout,orders);const text=all(info).concat(all(state)).map(n=>n.textContent||'').join(' ');
 for(const expected of ['Ordre 7886901','Eksempel ApS · Bo Hansen','10 stk. · Kasket','38687070','2300 København S','1.246,13','Reserveret · ikke hævet','Korrektur godkendt hos PF','Produktionsstart','Ikke bekræftet','Version 1 · godkendt'])assert.ok(text.includes(expected),expected);
 assert.equal(all(info).find(n=>n.textContent==='bo@example.test').href,'mailto:bo@example.test');assert.equal(all(info).find(n=>n.textContent==='+45 12 34 56 78').href,'tel:+4512345678');
 const missing=new Element('div');appendOrderSummaryInfo(missing,{orders:[{lines:[],shipping:{}}]});appendOrderSummaryState(missing,undefined,[]);assert.ok(!all(missing).some(n=>String(n.textContent||'').includes('undefined')));assert.ok(!all(missing).some(n=>n.textContent==='Total inkl. moms'));
 }finally{globalThis.document=before;}});
