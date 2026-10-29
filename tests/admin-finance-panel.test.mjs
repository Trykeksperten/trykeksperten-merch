import test from 'node:test';
import assert from 'node:assert/strict';
import {financePanel} from '../dist/admin-finance.mjs';
class Element {constructor(tag){this.tag=tag;this.children=[];this.textContent='';}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}setAttribute(){}}
const all=n=>[n,...n.children.flatMap(all)];
const data={summary:{ordered:10000,shipped:10000,captured:0,refunded:0,problems:[]},policy:{},configuration:{},shipments:[],mail:[],documents:[],billing:{},payments:[],operations:[]};
for(const fails of [false,true])test('opening finance checks Quickpay without capture; failure='+fails,async()=>{
 const previous=globalThis.document;globalThis.document={createElement:t=>new Element(t)};const calls=[];
 try{const root=financePanel({id:'ord',checkoutId:'pay'},async(url,method,input)=>{calls.push(input);if(method==='POST'&&fails)throw Error('offline');return {json:async()=>method==='POST'?{}:data};});root.open=true;root.ontoggle();await new Promise(r=>setTimeout(r,20));
 assert.deepEqual(calls.filter(Boolean),[{action:'reconcile'}]);
 assert.equal(all(root).some(n=>n.tag==='button'&&n.textContent.startsWith('Bekræft hævning')), !fails);
 const book=all(root).find(n=>n.tag==='details'&&n.children.some(c=>c.textContent==='Bogholderi · bilag og bankafstemning'));
 assert.ok(book);assert.ok(!book.open);assert.ok(all(book).some(n=>n.textContent==='Registrér afregning fra Clearhaus / bank'));
 root.ontoggle();assert.equal(calls.filter(Boolean).length,1);
 }finally{globalThis.document=previous;}
});
