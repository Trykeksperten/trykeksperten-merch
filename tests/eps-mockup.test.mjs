import test from 'node:test';import assert from 'node:assert/strict';
// Browser resources are replaced; no network or real IndexedDB is used.
globalThis.indexedDB={open:()=>({})};
const {renderCartMockup,mailMockupBase64}=await import('../dist/cart-mockup.mjs');
const {setLanguage}=await import('../dist/i18n-core.mjs');
const option={id:'front',image:'https://images.pfconcept.com/ImprintImages_All/JPG/500x500/TEST_front.jpg',impWidthMm:80,impHeightMm:40,impLocation:'Forside',impMethod:'Transfer',coorTopLeftX:300,coorTopRightX:1200,coorBottomLeftX:300,coorBottomRightX:1200,coorTopLeftY:400,coorTopRightY:400,coorBottomLeftY:1000,coorBottomRightY:1000};
const eps={id:'eps',name:'original.eps',type:'application/postscript'},pdf={id:'pdf',name:'original.pdf',type:'application/pdf'};
const art=logo=>({id:logo.id,logo,x:.4,y:.6,scale:.34,rotation:30});
const original=new Blob(['%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 40']);
function browserFixture(){
 const draws=[],canvases=[];globalThis.Image=class{naturalWidth=500;naturalHeight=500;set src(value){queueMicrotask(()=>this.onload());}};
 globalThis.document={fonts:{ready:Promise.resolve()},createElement(tag){assert.equal(tag,'canvas');const attrs=new Map();const ctx={save(){},restore(){},translate(x,y){draws.push(['translate',x,y]);},scale(){},rotate(value){draws.push(['rotate',value]);},drawImage(){draws.push(['image']);},fillRect(){},strokeRect(){draws.push(['placeholder']);},setLineDash(){},fillText(text){draws.push(['text',text]);},measureText(text){return {width:text.length*10};}};const canvas={width:0,height:0,getContext:()=>ctx,setAttribute:(key,value)=>attrs.set(key,value),getAttribute:key=>attrs.get(key)||null,toDataURL:()=> 'data:image/png;base64,cG5n'};canvases.push(canvas);return canvas;}};
 return {draws,canvases};
}
const opts={allowEPSPlaceholder:true,loadOriginal:async()=>original,loadPreview:async logo=>logo.id==='eps'?null:new Blob(['PNG'],{type:'image/png'})};
test('strict default refuses an EPS without preview, even if its original is available',async()=>{browserFixture();await assert.rejects(renderCartMockup({},option,{artworks:[art(eps)]},{...opts,allowEPSPlaceholder:false}),/ikke vises som skitse/);});
test('customer preview preserves other logos and text around EPS in either layer order without mutating the design',async()=>{
 for(const artworks of [[art(eps),art(pdf)],[art(pdf),art(eps)]]){
  const f=browserFixture(),design={artworks,text:'CUSTOMER TEXT',textPlacement:{font:'Arial',scale:.24},ink:'#123456'},before=structuredClone(design);
  const canvas=await renderCartMockup({},option,design,opts);
  assert.equal(f.draws.filter(row=>row[0]==='image').length,2,'product and real PDF preview are drawn');
  assert.equal(f.draws.filter(row=>row[0]==='placeholder').length,1);
  assert.ok(f.draws.some(row=>row[0]==='text'&&row[1]==='CUSTOMER TEXT'));
  assert.match(canvas.getAttribute('data-preview-warning'),/EPS kræver manuel filkontrol/);
  assert.match(canvas.getAttribute('aria-label'),/Ufuldstændig/);
  assert.deepEqual(design,before);
 }
});
test('EPS-only and legacy single-logo designs get a labelled placeholder and an embedded warning',async()=>{
 for(const design of [{artworks:[art(eps)]},{logo:eps}]){const f=browserFixture(),canvas=await renderCartMockup({},option,design,opts);assert.equal(f.draws.filter(row=>row[0]==='placeholder').length,1);assert.ok(f.draws.some(row=>row[1]==='EPS'));assert.ok(f.draws.some(row=>row[1]==='Ufuldstændig forhåndsvisning'));assert.match(canvas.getAttribute('data-preview-warning'),/manuel filkontrol/);}
});
test('missing/invalid EPS originals, mismatched types and missing PDF previews cannot become placeholders',async()=>{
 for(const loadOriginal of [async()=>null,async()=>new Blob(['invalid'])]){browserFixture();await assert.rejects(renderCartMockup({},option,{artworks:[art(eps)]},{...opts,loadOriginal}),/mangler eller er ugyldig/);}
 for(const logo of [pdf,{...eps,name:'original.ai'},{...eps,type:'application/pdf'}]){browserFixture();await assert.rejects(renderCartMockup({},option,{artworks:[art(logo)]},{...opts,loadPreview:async()=>null}),/ikke vises som skitse/);}
});
test('conversion errors remain errors; the fallback does not swallow a failed preview operation',async()=>{browserFixture();await assert.rejects(renderCartMockup({},option,{artworks:[art(eps)]},{...opts,loadPreview:async()=>{throw Error('conversion failed');}}),/conversion failed/);});
test('an existing real EPS preview works in strict mode without a warning',async()=>{const f=browserFixture(),canvas=await renderCartMockup({},option,{artworks:[art(eps)]},{loadPreview:async()=>new Blob(['PNG'],{type:'image/png'})});assert.equal(canvas.getAttribute('data-preview-warning'),null);assert.equal(f.draws.filter(row=>row[0]==='placeholder').length,0);assert.equal(f.draws.filter(row=>row[0]==='image').length,2);});
test('English warning is embedded in pixels while DOM metadata retains the Danish translation source',async()=>{setLanguage('en');try{const f=browserFixture(),canvas=await renderCartMockup({},option,{artworks:[art(eps)]},opts);assert.ok(f.draws.some(row=>row[1]==='Incomplete preview'));assert.ok(f.draws.some(row=>row[1]==='EPS is shown as a placeholder and requires manual artwork review.'));assert.match(canvas.getAttribute('data-preview-warning'),/^Ufuldstændig/);}finally{setLanguage('da');}});
test('incomplete customer previews cannot be exported as order/mail mockups',async()=>{browserFixture();const canvas=await renderCartMockup({},option,{artworks:[art(eps)]},opts);assert.throws(()=>mailMockupBase64(canvas),/ufuldstændig forhåndsvisning/);const complete=document.createElement('canvas');complete.width=1024;complete.height=1024;assert.equal(mailMockupBase64(complete),'cG5n');});
