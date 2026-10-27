import test from 'node:test';
import assert from 'node:assert/strict';
import {appendOrderSummaryInfo,appendOrderSummaryState} from '../dist/admin-order-summary.mjs';
class Element{constructor(tag){this.tag=tag;this.children=[];}append(...nodes){this.children.push(...nodes);}}
const all=node=>[node,...node.children.flatMap(all)];
test('compact order summaries retain core facts and one accurate status without repeating detail fields',()=>{const before=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};try{
 const checkout={createdAt:'2026-10-23T12:52:00Z',totalIncVat:124613,status:'authorized',billing:{company:'Eksempel ApS'},shipping:{name:'Bo Hansen',email:'bo@example.test',phone:'+45 12 34 56 78',postalCode:'2300',city:'København S'},productNames:{cap:'Kasket'},lines:[{productId:'cap',sku:'38687070',quantity:10}]},orders=[{pfOrderNumber:'7886901',status:'approval_recorded',pfStatus:'PROCESSING',expectedShipDate:'2026-10-29T00:00:00.000Z',proof:{version:1},decision:{decision:'approve'}}],info=new Element('div'),state=new Element('div');
 appendOrderSummaryInfo(info,{checkout,orders});appendOrderSummaryState(state,checkout,orders);const text=all(info).concat(all(state)).map(n=>n.textContent||'').join(' ');
 for(const expected of ['Ordre 7886901','Eksempel ApS · Bo Hansen','10 stk. · Kasket','1.246,13','Reserveret · ikke hævet','Afventer produktion hos PF','Seneste PF-status','PROCESSING','Forventet afsendelse','29.10.2026'])assert.ok(text.includes(expected),expected);
 for(const detail of ['bo@example.test','+45 12 34 56 78','Produktionsstart','Korrektur','Varenr.','Levering:'])assert.ok(!text.includes(detail),detail);assert.equal(all(state).filter(n=>n.tag==='dt').length,5);
 const missing=new Element('div');appendOrderSummaryInfo(missing,{orders:[{lines:[],shipping:{}}]});appendOrderSummaryState(missing,undefined,[]);assert.ok(!all(missing).some(n=>String(n.textContent||'').includes('undefined')));assert.ok(!all(missing).some(n=>n.textContent==='Total inkl. moms'));
 }finally{globalThis.document=before;}});
test('multiple supplier orders keep status and planned date associated; absent dates are explicit',()=>{
 const before=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
 try{
  const state=new Element('div');appendOrderSummaryState(state,null,[{pfOrderNumber:'111',pfStatus:'PROCESSING',expectedShipDate:'2026-10-29'},{pfOrderNumber:'222',pfStatus:'STALLED',expectedShipDate:'invalid'}]);
  const children=state.children[0].children,facts=Object.fromEntries(children.filter((_,i)=>i%2===0).map((n,i)=>[n.textContent,children[i*2+1].textContent]));
  assert.equal(facts['Seneste PF-status · 111'],'PROCESSING');assert.equal(facts['Forventet afsendelse · 111'],'29.10.2026');
  assert.equal(facts['Seneste PF-status · 222'],'STALLED');assert.equal(facts['Forventet afsendelse · 222'],'Ikke modtaget fra PF');
 }finally{globalThis.document=before;}
});
