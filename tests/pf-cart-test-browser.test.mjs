import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {artworkColorChanges,assertProductionColors} from '../dist/artwork-production-colors.mjs';
const source=(await readFile(new URL('../dist/pf-cart-test.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export function bindCartTest','function bindCartTest');
test('test reset preserves cart, renders original colours and includes each mockup with raw upload',async()=>{
 class Element{
  children=[];dataset={};value='';
  append(...children){this.children.push(...children);}
  replaceChildren(){this.children=[];}
  remove(){this.removed=true;}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.tag==='input'?[child]:[]),...child.querySelectorAll(selector)]);}
 }
 const nodes=Object.fromEntries(['test-cart-preview','test-cart-panel','test-source','test-load-cart'].map(id=>[id,new Element()]));
 const cart=[{productId:'p',sku:'s',quantity:1,decorations:[{optionId:'front',colors:1,artworks:[{logo:{id:'a',name:'orange.ai'},paletteColors:[{source:'#ff5000',target:'#cf5820'}]}]}]}];
 const before=structuredClone(cart),rendered=[];
 const context=vm.createContext({document:{getElementById:id=>nodes[id],createElement:tag=>Object.assign(new Element(),{tag})},readCart:()=>cart,structuredClone,crypto:{randomUUID:()=> 'request'},artworkColorChanges,assertProductionColors,loadFile:async()=>new Blob(['original']),Uint8Array,btoa,fetch:async()=>({ok:true,json:async()=>({variants:[{sku:'s',options:[{id:'front'}]}]})}),renderCartMockup:async(p,o,d)=>{rendered.push(structuredClone(d));return 'canvas';},mailMockupBase64:()=> 'png'});
 vm.runInContext(source+';globalThis.binding=bindCartTest();',context);
 nodes['test-load-cart'].onclick();
 await assert.rejects(context.binding.payload({}),/Farven er ændret/);
 const section=nodes['test-cart-preview'].children.find(el=>el.tag==='section');
 section.children.find(el=>el.tag==='button').onclick();
 section.querySelectorAll('input')[0].value='717 C';
 const payload=await context.binding.payload({});
 assert.deepEqual(cart,before);
 assert.equal(rendered[0].artworks[0].paletteColors,undefined);
 assert.equal(payload.mockups.length,1);assert.equal(payload.mockups[0].base64,'png');
 assert.equal(payload.artworks[0].base64,btoa('original'));
 cart[0].quantity=2;await assert.rejects(context.binding.payload({}),/Kurven er ændret/);
});
