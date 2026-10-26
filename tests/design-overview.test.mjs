import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesignOverview} from '../dist/design-overview.mjs';

class Element {
 children=[];attributes={};textContent='';open=false;
 setAttribute(key,value){this.attributes[key]=value;}
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
  resolveBack();await pending;assert.equal(stage.children[0].alt,'Dit design · Bagside');assert.equal(stage.attributes['aria-busy'],'false');
  await nodes['[data-prev]'].onclick();assert.equal(stage.children[0],front);assert.equal(calls,2);
  overview.open();await tick();assert.equal(calls,3,'reopening regenerates previews for updated designs');
 }finally{globalThis.document=oldDocument;}
});
