import test from 'node:test';
import assert from 'node:assert/strict';
import {renderProofPdf} from '../dist/proof-pdf-preview.mjs';
function fixture({pages=2,failPage=0}={}){
 const painted=[],cleaned=[];let destroyed=false;
 const element=tag=>({tag,children:[],attributes:{},setAttribute(k,v){this.attributes[k]=v;},append(...nodes){this.children.push(...nodes);},getContext(){return {};}});
 const container={clientWidth:540,children:['loading'],ownerDocument:{createElement:element},replaceChildren(...nodes){this.children=nodes;}};
 const pdfjs={GlobalWorkerOptions:{},getDocument(options){assert.equal(options.isEvalSupported,false);assert.equal(options.enableXfa,false);return {promise:Promise.resolve({numPages:pages,getPage:async n=>({getViewport:({scale})=>({width:842*scale,height:595*scale}),render:()=>({promise:failPage===n?Promise.reject(Error('Broken page')):Promise.resolve(painted.push(n))}),cleanup:()=>cleaned.push(n)})}),destroy:async()=>{destroyed=true;}};}};
 return {container,pdfjs,painted,cleaned,destroyed:()=>destroyed};
}
test('all proof pages are drawn with page numbers, bounded resolution and no embedded plugin',async()=>{
 const f=fixture();const result=await renderProofPdf(new Uint8Array([1,2]),f.container,{loadPDF:async()=>f.pdfjs,pixelRatio:3});
 assert.equal(result.pages,2);assert.deepEqual(f.painted,[1,2]);assert.deepEqual(f.cleaned,[1,2]);assert.ok(f.destroyed());assert.equal(f.pdfjs.GlobalWorkerOptions.workerSrc,'/vendor/pdf.worker.mjs');
 for(const [i,section] of f.container.children.entries()){assert.equal(section.tag,'section');assert.equal(section.children[0].textContent,`Side ${i+1} af 2`);const canvas=section.children[1];assert.equal(canvas.tag,'canvas');assert.ok(canvas.width<=2201);assert.ok(canvas.height<=2201);assert.equal(canvas.attributes.role,'img');}
});
test('a failed later page never leaves a misleading partial proof and releases PDF resources',async()=>{
 const f=fixture({failPage:2});await assert.rejects(renderProofPdf(new Uint8Array(),f.container,{loadPDF:async()=>f.pdfjs}),/Broken page/);assert.deepEqual(f.container.children,['loading']);assert.ok(f.destroyed());
});
test('empty and excessively long proofs are rejected before any page is presented',async()=>{
 for(const pages of [0,41]){const f=fixture({pages});await assert.rejects(renderProofPdf(new Uint8Array(),f.container,{loadPDF:async()=>f.pdfjs}),/1–40 sider/);assert.deepEqual(f.container.children,['loading']);assert.ok(f.destroyed());}
});
