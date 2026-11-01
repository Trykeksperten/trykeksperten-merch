import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesignOverview} from '../dist/design-overview.mjs';

class Element {
 children=[];attributes={};textContent='';open=false;
 setAttribute(key,value){this.attributes[key]=value;}
 getAttribute(key){return this.attributes[key]??null;}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 querySelector(selector){return selector==='img'?this.children.find(c=>c.tag==='img'):this.nodes[selector];}
 addEventListener(){}
 showModal(){this.open=true;}
 close(){this.open=false;}
 async decode(){}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('overview keeps the previous mockup until the next is decoded and reuses cached images',async()=>{
 const oldDocument=globalThis.document;
 const root=new Element(),nodes=Object.fromEntries(['.pf-overview-image','.pf-overview-status','nav','[data-prev]','[data-next]','.pf-overview-paging span','[data-edit]','[data-continue]','[data-close]'].map(key=>[key,new Element()]));
 globalThis.document={createElement(tag){const el=new Element();el.tag=tag;if(tag==='dialog')el.nodes=nodes;return el;}};
 try{
  const items=['Forside','Bagside'].map(impLocation=>({option:{impLocation},ready:true}));
  let resolveBack,calls=0;
  const overview=createDesignOverview({root,getItems:()=>items,renderMockup:async item=>{calls++;if(item===items[1])await new Promise(resolve=>resolveBack=resolve);return {toDataURL:()=>item.option.impLocation};},onEdit(){},onContinue(){}});
  overview.open();await tick();
  const stage=nodes['.pf-overview-image'],front=stage.children[0];assert.equal(front.alt,'Dit design · Forside');
  const pending=nodes['[data-next]'].onclick();await tick();assert.equal(stage.children[0],front);assert.equal(stage.attributes['aria-busy'],'true');
  resolveBack();await pending;assert.equal(stage.children[0].alt,'Dit design · Bagside');assert.equal(stage.attributes['aria-busy'],'false');assert.equal(nodes['.pf-overview-status'].textContent,'Gemt design · forhåndsvisning');
  await nodes['[data-prev]'].onclick();assert.equal(stage.children[0],front);assert.equal(calls,2);
  overview.open();await tick();assert.equal(calls,3,'reopening regenerates previews for updated designs');
 }finally{globalThis.document=oldDocument;}
});

test('overview preserves incomplete-preview warnings and clears them for complete placements',async()=>{
 const oldDocument=globalThis.document;
 const root=new Element(),nodes=Object.fromEntries(['.pf-overview-image','.pf-overview-status','nav','[data-prev]','[data-next]','.pf-overview-paging span','[data-edit]','[data-continue]','[data-close]'].map(key=>[key,new Element()]));
 globalThis.document={createElement(tag){const el=new Element();el.tag=tag;if(tag==='dialog')el.nodes=nodes;return el;}};
 try{
  const items=['Forside','Bagside'].map(impLocation=>({option:{impLocation},ready:true})),warning='Ufuldstændig forhåndsvisning: EPS kræver manuel filkontrol.';
  const overview=createDesignOverview({root,getItems:()=>items,renderMockup:async item=>({toDataURL:()=>item.option.impLocation,getAttribute:()=>item===items[0]?warning:null}),onEdit(){},onContinue(){}});
  overview.open();await tick();
  assert.equal(nodes['.pf-overview-status'].textContent,warning);
  assert.equal(nodes['.pf-overview-image'].children[0].getAttribute('data-preview-warning'),warning);
  await nodes['[data-next]'].onclick();
  assert.equal(nodes['.pf-overview-status'].textContent,'Gemt design · forhåndsvisning');
  assert.equal(nodes['.pf-overview-image'].children[0].getAttribute('data-preview-warning'),null);
  await nodes['[data-prev]'].onclick();assert.equal(nodes['.pf-overview-status'].textContent,warning);
 }finally{globalThis.document=oldDocument;}
});
