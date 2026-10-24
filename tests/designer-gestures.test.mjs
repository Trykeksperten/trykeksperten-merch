import test from 'node:test';
import assert from 'node:assert/strict';
import {gesturePlacement,bindDesignerGestures} from '../dist/designer-gestures.mjs';
import {normalizeArtworkForOption,validateArtworkLayers} from '../dist/design-layers.mjs';
const art={id:'logo',logo:{id:'file',pixelWidth:400,pixelHeight:200},x:.5,y:.5,scale:.3};
test('drag and symmetric two-finger scaling use print-area coordinates at every preview size',()=>{
 for(const width of [90,184,368,800]){const rect={width,height:width/2};const moved=gesturePlacement(art,[{x:0,y:0}],[{x:width*.1,y:width*.05}],rect);assert.equal(moved.x,.6);assert.equal(moved.y,.6);
 const scaled=gesturePlacement(art,[{x:0,y:0},{x:20,y:0}],[{x:-10,y:0},{x:30,y:0}],rect);assert.equal(scaled.scale,.6);assert.equal(scaled.x,.5);assert.equal(scaled.y,.5);
 const option={impWidthMm:100,impHeightMm:40};const bounded=normalizeArtworkForOption({...scaled,scale:8,x:4,y:-3},option);assert.equal(validateArtworkLayers([bounded],option),'');
 }
});
function harness(){let state={...art},begins=0,ends=0;const handlers={},events={},stage={isConnected:true,addEventListener:(k,f)=>handlers[k]=f,removeEventListener:k=>delete handlers[k],setPointerCapture:()=>{}},win={addEventListener:(k,f)=>events[k]=f,removeEventListener:k=>delete events[k]};const dispose=bindDesignerGestures(stage,{win,begin:()=>{begins++;return true;},read:()=>state,rect:()=>({width:100,height:100}),change:value=>state=value,end:()=>ends++});const event=(id,x,y)=>({pointerId:id,button:0,clientX:x,clientY:y,preventDefault(){}});return {handlers,events,stage,dispose,event,state:()=>state,counts:()=>({begins,ends})};}
test('adding and releasing a second finger rebases without jumping, and commits once per gesture',()=>{
 const f=harness();f.handlers.pointerdown(f.event(1,0,0));f.events.pointermove(f.event(1,10,0));assert.equal(f.state().x,.6);
 f.handlers.pointerdown(f.event(2,30,0));f.events.pointermove(f.event(2,50,0));assert.equal(f.state().scale,.6);
 f.events.pointerup(f.event(2,50,0));const afterPinch={...f.state()};f.events.pointermove(f.event(1,10,0));assert.deepEqual(f.state(),afterPinch);f.events.pointermove(f.event(1,15,0));assert.ok(Math.abs(f.state().x-afterPinch.x-.05)<1e-9);
 f.events.pointerup(f.event(1,15,0));assert.deepEqual(f.counts(),{begins:1,ends:1});assert.deepEqual(f.events,{});f.dispose();assert.deepEqual(f.handlers,{});
});
test('cancel, blur and navigation release pointer tracking and cannot leave editing stuck',()=>{
 for(const ending of ['pointercancel','blur','navigation']){const f=harness();f.handlers.pointerdown(f.event(1,0,0));if(ending==='navigation'){f.stage.isConnected=false;f.events.pointermove(f.event(1,10,0));}else f.events[ending](f.event(1,0,0));assert.deepEqual(f.events,{});f.dispose();}
});
