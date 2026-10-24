import test from 'node:test';
import assert from 'node:assert/strict';
import {bindFreightQuote} from '../dist/checkout-freight.mjs';
class Element{constructor(tag){this.tag=tag;this.children=[];this.events={};this.disabled=false;this.checked=false;}append(...n){this.children.push(...n);}setAttribute(){}addEventListener(k,fn){this.events[k]=fn;}querySelector(){return null;}}
const all=n=>[n,...n.children.flatMap(all)];
test('checkout requires separate price acceptance and removes it immediately when address or cart changes',async()=>{
 const keys=['document','window','sessionStorage','FormData','fetch','setTimeout','clearTimeout'],original=Object.fromEntries(keys.map(k=>[k,globalThis[k]]));
 const form=new Element('form');form.elements=Object.fromEntries(['name','email','phone','street','postalCode','city','country'].map(k=>[k,{value:k,checkValidity:()=>true}]));form.insertBefore=(n)=>form.append(n);let cart=[{id:'one',quantity:25}],events={},changes=[],revision=1;
 globalThis.document={createElement:tag=>new Element(tag),contains:()=>true};globalThis.window={addEventListener:(key,fn)=>events[key]=fn,removeEventListener:()=>{}};globalThis.FormData=class{constructor(){return Object.entries(form.elements).map(([k,v])=>[k,v.value]);}};globalThis.sessionStorage={getItem:()=>null,setItem(){},removeItem(){}};globalThis.setTimeout=()=>1;globalThis.clearTimeout=()=>{};
 globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);return {ok:true,json:async()=>body.action==='request'?{id:'ref',token:'secret'}:{id:'ref',status:'quoted',revision,validUntil:new Date(Date.now()+3600000).toISOString(),freightExVat:8000,freightIncVat:10000,totalIncVat:110000}};};
 try{const controller=bindFreightQuote(form,{readCart:()=>cart,goodsTotalIncVat:100000,onChange:v=>changes.push(v)}),nodes=all(form),request=nodes.find(n=>n.tag==='button'),accept=nodes.find(n=>n.type==='checkbox');assert.equal(controller.acceptedQuote(),null);assert.equal(changes.at(-1).price,null);
 await request.onclick();assert.equal(accept.disabled,false);assert.equal(changes.at(-1).accepted,false);accept.checked=true;accept.onchange();assert.equal(controller.acceptedQuote().revision,1);assert.equal(changes.at(-1).accepted,true);
 form.elements.street.value='new street';form.events.input({target:{name:'street'}});assert.equal(controller.acceptedQuote(),null);assert.equal(accept.checked,false);assert.equal(changes.at(-1).price,null);
 revision=2;await request.onclick();assert.equal(controller.acceptedQuote(),null);accept.checked=true;accept.onchange();assert.equal(controller.acceptedQuote().revision,2);
 cart=[{id:'one',quantity:50}];events['pf-cart-change']();assert.equal(controller.acceptedQuote(),null);assert.equal(accept.disabled,true);assert.equal(changes.at(-1).price,null);
 }finally{for(const key of keys)if(original[key]===undefined)delete globalThis[key];else globalThis[key]=original[key];}
});
