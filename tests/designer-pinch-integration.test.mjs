import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {bindDesignerGestures} from '../dist/designer-gestures.mjs';
import {normalizeArtworkForOption,normalizeTextPlacement,artworkPrintSize,textPrintSize,optionPrintSize,validateArtworkLayers} from '../dist/design-layers.mjs';
import {defaultTextPlacement} from '../dist/pf-text.mjs';
import {drawTextPreview,textPreviewLayout} from '../dist/text-preview.mjs';
const source=await readFile(new URL('../dist/pf-studio.mjs',import.meta.url),'utf8'),noop=()=>{};
const extract=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
function fixture(kind,width,rotation=0){
 const handlers={},events={},nodes={},saved=[],option={id:'front',impWidthMm:100,impHeightMm:40};
 const $=id=>nodes[id]??={value:'',style:{},dataset:{},hidden:false,classList:{toggle:noop,remove:noop},setAttribute:noop,replaceChildren(...children){this.children=children;}};
 const layer=kind==='text'?$('designer-text'):{style:{},dataset:{layerId:'art'},classList:{toggle:noop},hasAttribute:()=>false};
 $('designer-text').hasAttribute=name=>name==='data-text-layer';$('designer-layers').children=kind==='text'?[]:[layer];
 $('text').value=kind==='text'?'PINCH\nTEXT':'';$('colors').value=1;$('ink').value='#123456';
 Object.assign($('designer-zone'),{clientWidth:width,clientHeight:width*.4,getBoundingClientRect:()=>({width,height:width*.4})});
 Object.assign($('designer-stage'),{isConnected:true,addEventListener:(name,fn)=>{handlers[name]=fn;},removeEventListener:name=>{delete handlers[name];},setPointerCapture:noop});
 const win={addEventListener:(name,fn)=>{events[name]=fn;},removeEventListener:name=>{delete events[name];}};
 const ctx={translate:noop,scale:noop,fillText:noop,fillRect:noop,save:noop,restore:noop,measureText:text=>({width:text.length*50})};
 const context=vm.createContext({$,option,p:{id:'p'},v:{sku:'sku'},textPlacement:normalizeTextPlacement($('text').value,{...defaultTextPlacement(),scale:.25,rotation},option),
  artworks:kind==='text'?[]:[normalizeArtworkForOption({id:'art',logo:{id:'file',pixelWidth:400,pixelHeight:200},x:.5,y:.5,scale:.25,rotation},option)],activeArtworkId:kind==='text'?'text':'art',
  selectedFoil:'',selectedColors:new Map(),history:[],future:[],logo:null,drawTextPreview,textPreviewLayout,textPrintSize,optionPrintSize,defaultTextPlacement,normalizeArtworkForOption,normalizeTextPlacement,artworkPrintSize,
  bindDesignerGestures:(stage,options)=>bindDesignerGestures(stage,{...options,win}),selectContentTab:noop,renderLayerControls:noop,renderFoilControls:noop,renderColorChoices:noop,renderApproval:noop,schedulePrice:noop,syncDimensionInputs:noop,renderDesigner:noop,renderPreflight:noop,decorationPreviewColor:()=>null,window:{devicePixelRatio:2},
  document:{createElement:()=>({getContext:()=>ctx,style:{},setAttribute:noop})},persistWorking:()=>saved.push(structuredClone(kind==='text'?context.textPlacement:context.artworks[0])),preview:async()=>{}});
 vm.runInContext(extract(' const snapshot=',' const stockStatus=').trim()+'\nglobalThis.undo=undo;globalThis.redo=redo;',context);
 vm.runInContext(extract(' function renderStudioText(',' async function renderDesigner(){'),context);
 vm.runInContext(extract(' let gestureLayer=null',' const savePlacement='),context);
 const event=(id,x,y)=>({pointerId:id,button:0,pointerType:'touch',clientX:x,clientY:y,preventDefault:noop,target:{closest:selector=>selector==='[data-layer-id],[data-text-layer]'?layer:null}});
 return {context,$,layer,saved,events,handlers,event,state:()=>kind==='text'?context.textPlacement:context.artworks[0]};
}
for(const kind of ['logo','text'])test('actual studio '+kind+' pinch scales, rebases on finger release, persists once and supports undo/redo',async()=>{
 for(const width of [90,368,800])for(const rotation of [0,45,90]){
  const f=fixture(kind,width,rotation),before=structuredClone(f.state()),start=width*.2;
  f.handlers.pointerdown(f.event(1,start,width*.2));f.handlers.pointerdown(f.event(2,start+20,width*.2));
  f.events.pointermove(f.event(2,start+40,width*.2));assert.equal(f.state().scale,.5);assert.equal(f.state().rotation,rotation);
  if(kind==='text')assert.ok(f.layer.children?.[0],'pinch updates the shared text canvas');else assert.ok(parseFloat(f.layer.style.width)>0);
  f.events.pointerup(f.event(2,start+40,width*.2));const afterPinch=structuredClone(f.state());
  f.events.pointermove(f.event(1,start,width*.2));assert.deepEqual(structuredClone(f.state()),afterPinch,'second finger release must not reset scale or jump');
  f.events.pointerup(f.event(1,start,width*.2));assert.equal(f.saved.length,1);assert.equal(f.saved[0].scale,.5);assert.deepEqual(f.events,{});
  await f.context.undo();assert.deepEqual(structuredClone(f.state()),before);await f.context.redo();assert.deepEqual(structuredClone(f.state()),afterPinch);
 }
});
test('actual pinch remains bounded and pointer cancellation releases listeners and saves the bounded result',()=>{
 for(const kind of ['logo','text']){
  const f=fixture(kind,200,45);f.handlers.pointerdown(f.event(1,0,0));f.handlers.pointerdown(f.event(2,20,0));f.events.pointermove(f.event(2,2000,2000));
  assert.equal(f.state().scale,1);if(kind==='logo')assert.equal(validateArtworkLayers([f.state()],f.context.option),'');else assert.deepEqual(structuredClone(f.state()),normalizeTextPlacement(f.$('text').value,f.state(),f.context.option));
  f.events.pointercancel(f.event(1,0,0));assert.equal(f.saved.length,1);assert.deepEqual(f.events,{});
 }
});
test('one-finger movement preserves scale and navigation does not save a detached studio',()=>{
 const f=fixture('logo',200);f.handlers.pointerdown(f.event(1,0,0));f.events.pointermove(f.event(1,20,0));assert.equal(f.state().scale,.25);assert.equal(f.state().x,.6);
 f.$('designer-stage').isConnected=false;f.events.pointermove(f.event(1,30,0));assert.equal(f.saved.length,0);assert.deepEqual(f.events,{});
});
