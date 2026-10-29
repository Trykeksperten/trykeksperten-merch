import test from 'node:test';
import assert from 'node:assert/strict';
import {compactOrderWorkspace} from '../dist/admin-order-tabs.mjs';
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.className='';}
 get childElementCount(){return this.children.length;}
 append(...nodes){for(const n of nodes){if(n.parentElement)n.parentElement.children=n.parentElement.children.filter(x=>x!==n);n.parentElement=this;this.children.push(n);}}
 insertBefore(node,before){if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(x=>x!==node);node.parentElement=this;const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,node);}
 setAttribute(k,v){this.attributes[k]=v;}
 querySelector(selector){return this.children.flatMap(n=>[n,...descendants(n)]).find(n=>selector[0]==='.'?n.className.split(' ').includes(selector.slice(1)):n.tag===selector)||null;}
 focus(){document.activeElement=this;}
}
const descendants=n=>n.children.flatMap(c=>[c,...descendants(c)]);
function fixture(id){const box=new Element('section'),next=new Element('section');next.className='order-next';box.append(next);const nodes=Object.fromEntries(['products','overview','supplierDocs','documents','contact','automation','history','events','decision'].map(k=>[k,new Element('section')]));const textarea=new Element('textarea'),resend=new Element('section');resend.className='order-resend';nodes.contact.append(textarea,resend);const actions=new Element('details'),summary=new Element('summary'),upload=new Element('details'),task=new Element('section');task.className='order-primary-task';actions.append(summary,upload,task);return {box,next,textarea,task,nodes,actions,args:{order:{id,status:'approval_pending_pf'},...nodes,actions,proofNodes:[new Element('iframe')]}};}
test('order tabs keep next step visible, preserve selection on refresh and expose primary tasks without duplicate shortcuts',()=>{
 const old=globalThis.document;globalThis.document={createElement:tag=>new Element(tag),activeElement:null};
 try{const f=fixture('fixture-tabs'),r=compactOrderWorkspace(f.box,f.args);assert.equal(r.panels.get('actions').hidden,false);assert.equal(r.panels.get('proof').hidden,true);assert.equal(f.next.parentElement,f.box);assert.equal(f.actions.children[1],f.task);assert.equal(f.nodes.contact.open,true);assert.equal(f.nodes.documents.open,true);assert.ok(r.panels.get('documents').querySelector('.order-resend'));assert.equal(r.panels.get('contact').querySelector('.order-resend'),null);
 assert.equal(f.next.children.length,0);r.select('proof',true);assert.equal(r.panels.get('proof').hidden,false);assert.equal(document.activeElement.attributes['aria-selected'],'true');
 const tablist=f.box.children[1].children[0];tablist.onkeydown({key:'ArrowRight',preventDefault(){}});assert.equal(r.panels.get('actions').hidden,false);r.select('contact',true);assert.equal(r.panels.get('contact').hidden,false);assert.equal(r.panels.get('contact').querySelector('textarea'),f.textarea);
 const again=fixture('fixture-tabs'),reopened=compactOrderWorkspace(again.box,again.args);assert.equal(reopened.panels.get('contact').hidden,false);assert.equal([...reopened.panels.values()].filter(p=>!p.hidden).length,1);
 const fresh=fixture('another-order');assert.equal(compactOrderWorkspace(fresh.box,fresh.args).panels.get('actions').hidden,false);
 }finally{globalThis.document=old;}
});

test('shared document rows keep the mail review inside Documents without duplicating it',()=>{
 const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
 try{const f=fixture('shared-documents'),host=new Element('div');host.className='document-mail-review';f.nodes.documents.append(host);const resend=f.nodes.contact.querySelector('.order-resend');const result=compactOrderWorkspace(f.box,f.args);assert.equal(resend.parentElement,host);assert.equal(result.panels.get('documents').querySelector('.order-resend'),resend);assert.equal(result.panels.get('contact').querySelector('.order-resend'),null);assert.equal(descendants(f.box).filter(node=>node===resend).length,1);}finally{globalThis.document=previous;}
});

test('pending tasks have one central action button and finance moves out of document archive',()=>{
 const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
 try{
  const f=fixture('central-actions'),finance=new Element('details');finance.className='order-finance-controls';f.nodes.documents.append(finance);
  f.args.order.attention={finance:{summary:{problems:['Hævning af afsendte varer afventer.']}}};
  const result=compactOrderWorkspace(f.box,f.args);
  assert.equal(result.panels.get('actions').hidden,false);
  assert.equal(result.panels.get('actions').querySelector('.order-finance-controls'),finance);
  assert.equal(result.panels.get('documents').querySelector('.order-finance-controls'),null);
  const buttons=descendants(f.box).filter(n=>n.tag==='button'&&n.textContent==='Afklar fakturering og betaling');
  assert.equal(buttons.length,1);assert.ok(!finance.open);buttons[0].onclick();assert.equal(finance.open,true);
  assert.equal(descendants(f.box).filter(n=>n===finance).length,1);
 }finally{globalThis.document=previous;}
});

test('proof task opens review without submitting or duplicating controls',()=>{
 const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
 try{
  const f=fixture('proof-action');f.args.order={id:'proof-action',status:'proof_received',proof:{version:1},attention:{}};
  const result=compactOrderWorkspace(f.box,f.args);
  const task=descendants(result.panels.get('actions')).find(n=>n.tag==='button'&&n.textContent==='Gennemgå ny korrektur fra PF');
  assert.ok(task);task.onclick();assert.equal(result.panels.get('proof').hidden,false);
  assert.equal(descendants(f.box).filter(n=>n===f.actions).length,1);
 }finally{globalThis.document=previous;}
});
