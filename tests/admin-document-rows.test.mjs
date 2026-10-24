import test from 'node:test';import assert from 'node:assert/strict';
import {createDocumentRows} from '../dist/admin-document-rows.mjs';
import {documentPanel} from '../dist/admin-documents.mjs';
import {resendPanel} from '../dist/admin-resend.mjs';
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.className='';this.textContent='';this.style={};}
 append(...nodes){for(const node of nodes){if(node.parentElement)node.remove();node.parentElement=this;this.children.push(node);}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 setAttribute(k,v){this.attributes[k]=v;}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null;}
}
const all=node=>[node,...node.children.flatMap(all)],settle=()=>new Promise(resolve=>setImmediate(resolve));
test('PDF and mail actions share one row per document and distinguish Financial from the customer',async()=>{
 const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
 try{
 const order={id:'ord-test',shipping:{email:'customer@example.test'}},rows=createDocumentRows(order),calls=[];
 const api=async(url,method,payload)=>{calls.push({url,method,payload});if(url.endsWith('/resend'))return {json:async()=>[{action:'confirmation',available:true,label:'Gensend ordrebekræftelse'},{action:'tracking',available:false,reason:'Afventer tracking.'},{action:'invoice',available:false,reason:'Ingen bogført faktura.'},{action:'proof',available:false,reason:'Ingen aktiv korrektur.'}]};return {json:async()=>({company:{accountantEmail:'finance@example.test'},documents:[{id:'doc-1',type:'basis',title:'Fakturagrundlag',version:1,createdAt:'2026-10-24T10:00:00Z'}],options:[{type:'basis',reason:''},{type:'confirmation',reason:''},{type:'shipment',reason:'Afsendelse kræves.'},{type:'receipt',reason:'Betaling kræves.'}]})};};
 documentPanel(order,api,rows);resendPanel(order,api,async()=>{},rows);await settle();
 assert.equal(rows.entries.size,6);assert.equal(rows.root.children.length,6);const confirmation=rows.entries.get('confirmation');assert.ok(all(confirmation.row).some(n=>n.textContent==='Opret PDF'));assert.ok(all(confirmation.row).some(n=>n.textContent==='Gensend ordremail'));assert.equal(all(rows.root).filter(n=>n.textContent==='Ordrebekræftelse').length,1);assert.equal(rows.entries.get('basis').email.textContent,'finance@example.test');assert.equal(confirmation.email.textContent,'customer@example.test');assert.ok(all(rows.entries.get('basis').row).some(n=>n.textContent==='Gennemse og send PDF'));assert.ok(all(rows.entries.get('receipt').row).some(n=>n.tag==='button'&&n.disabled));assert.equal(calls.filter(c=>c.method==='POST').length,0);
 }finally{globalThis.document=previous;}
});
test('clicking a mail action previews the exact recipient and never sends without a second action',async()=>{
 const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
 try{const rows=createDocumentRows({shipping:{email:'customer@example.test'}}),posts=[];const api=async(url,method,input)=>{if(method==='POST'){posts.push(input);return {json:async()=>({id:'draft-1',to:'customer@example.test',subject:'Ordrebekræftelse',text:'Existing order',attachments:[]})};}return {json:async()=>[{action:'confirmation',available:true,label:'Gensend'}]};};const panel=resendPanel({id:'test'},api,async()=>{},rows);await settle();await all(rows.root).find(n=>n.tag==='button').onclick();assert.deepEqual(posts,[{action:'confirmation'}]);assert.ok(all(panel).some(n=>n.textContent==='Til: customer@example.test'));assert.ok(all(panel).some(n=>n.textContent==='Send til customer@example.test'));}finally{globalThis.document=previous;}
});
