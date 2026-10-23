import test from 'node:test';
import assert from 'node:assert/strict';
import {correspondencePanel} from '../dist/admin-correspondence.mjs';
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.attributes={};this.textContent='';this.value='';}
 append(...items){this.children.push(...items);if(this.tag==='select'&&this.children.length===items.length)this.value=items[0]?.value||'';}
 replaceChildren(...items){this.children=[...items];}
 setAttribute(k,v){this.attributes[k]=v;}
}
const all=n=>[n,...n.children.flatMap(all)];
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('saved notes appear before the form, save in one click and reload; email still requires review',async()=>{
 const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
 try{
 const messages=[{kind:'note',text:'Existing note\nsecond line',status:'saved',createdAt:'2026-10-23T19:00:00Z'}],posts=[];
 const api=async(path,method,payload)=>{if(path.endsWith('/resend'))return {json:async()=>[]};if(method==='POST'){posts.push(payload);messages.push({...payload,status:payload.kind==='note'?'saved':'sent',createdAt:new Date().toISOString()});return {json:async()=>messages.at(-1)};}return {json:async()=>messages};};
 const order={id:'ord-test',shipping:{email:'customer@example.test'}};
 const panel=correspondencePanel(order,api);await settle();
 const notes=panel.children[1];assert.equal(notes.attributes['aria-label'],'Gemte interne noter');assert.ok(all(notes).some(n=>n.textContent==='Existing note\nsecond line'));
 const form=panel.children[3],kind=all(form).find(n=>n.attributes['aria-label']==='Beskedtype'),text=all(form).find(n=>n.tag==='textarea'),button=all(form).find(n=>n.tag==='button');
 assert.equal(button.textContent,'Gem intern note');text.value='New internal note';await button.onclick();
 assert.equal(posts.length,1);assert.equal(posts[0].kind,'note');assert.equal(text.value,'');assert.ok(all(notes).some(n=>n.textContent==='New internal note'));
 kind.value='email';kind.onchange();text.value='Customer message';await button.onclick();assert.equal(posts.length,1);assert.ok(all(form).some(n=>n.textContent==='Send e-mail til customer@example.test'));
 const reopened=correspondencePanel(order,api);await settle();assert.ok(all(reopened.children[1]).some(n=>n.textContent==='New internal note'));
 }finally{globalThis.document=previous;}
});
