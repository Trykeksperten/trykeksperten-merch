import test from 'node:test';
import assert from 'node:assert/strict';
import {bindContinuousRibbon} from '../dist/brand-ribbon-motion.mjs';
function fixture(width=148,viewport=390){
 let size=width,id=0,now=0;const callbacks=new Map(),windowEvents={},documentEvents={},trackEvents={};
 const cards=Array.from({length:13},()=>({style:{},getBoundingClientRect:()=>({width:size,height:152})}));
 const track={isConnected:true,style:{},dataset:{},querySelector:()=>({querySelectorAll:()=>cards}),addEventListener:(k,f)=>trackEvents[k]=f,removeEventListener:k=>delete trackEvents[k]};
 const win={requestAnimationFrame:f=>{callbacks.set(++id,f);return id;},cancelAnimationFrame:id=>callbacks.delete(id),addEventListener:(k,f)=>windowEvents[k]=f,removeEventListener:k=>delete windowEvents[k]};
 const doc={hidden:false,addEventListener:(k,f)=>documentEvents[k]=f,removeEventListener:k=>delete documentEvents[k]};
 const positions=()=>cards.map(card=>Number(card.style.transform.match(/translateX\(([^p]+)/)[1]));
 const coverage=()=>{const xs=positions().sort((a,b)=>a-b);let edge=0;for(const x of xs){if(x>edge+.001)break;if(x+size>edge)edge=x+size;}return edge>=viewport-.001;};
 return {track,win,doc,windowEvents,documentEvents,trackEvents,cards,positions,coverage,resize:(w,v)=>{size=w;viewport=v;windowEvents.resize();},frames:()=>callbacks.size,advance:ms=>{for(let elapsed=0;elapsed<ms;elapsed+=16){now+=16;const frames=[...callbacks.values()];callbacks.clear();frames.forEach(f=>f(now));if(track.isConnected&&!doc.hidden)assert.ok(coverage(),'cards cover the viewport at every frame');}}};
}
test('individual cards cover mobile and desktop for ten full loops without moving a wide parent layer',()=>{
 for(const [width,viewport] of [[148,390],[281.6,1280]]){const f=fixture(width,viewport);const dispose=bindContinuousRibbon(f.track,f);assert.equal(bindContinuousRibbon(f.track,f),dispose);assert.equal(f.track.dataset.ribbonMotion,'cards');assert.equal(f.track.style.transform,'');f.advance(320016);assert.equal(f.frames(),1);assert.ok(f.positions().every(x=>x>=-width&&x<=width*12));dispose();assert.equal(f.frames(),0);}
});
test('rotation, backgrounding and back navigation resume with one timer and clean up on navigation',()=>{
 const f=fixture();bindContinuousRibbon(f.track,f);f.advance(8016);const position=f.positions()[0]/148;f.resize(280,1280);assert.ok(Math.abs(f.positions()[0]/280-position)<.00001);assert.ok(f.coverage());f.doc.hidden=true;f.documentEvents.visibilitychange();assert.equal(f.frames(),0);f.advance(60000);f.doc.hidden=false;f.documentEvents.visibilitychange();f.windowEvents.pageshow();assert.equal(f.frames(),1);f.advance(64000);f.track.isConnected=false;f.advance(16);assert.equal(f.frames(),0);assert.equal(f.track.dataset.ribbonMotion,undefined);assert.deepEqual(f.windowEvents,{});assert.deepEqual(f.documentEvents,{});
});

function pointer(type,x,y,time=0){return {type,pointerId:1,isPrimary:true,button:0,clientX:x,clientY:y,timeStamp:time,cancelable:true,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};}
test('finger drags wrap in both directions, suppress accidental links and resume automatic motion',()=>{
 const f=fixture();bindContinuousRibbon(f.track,f);
 f.trackEvents.pointerdown(pointer('pointerdown',300,20));f.trackEvents.pointermove(pointer('pointermove',100,22,40));
 assert.ok(f.coverage());assert.equal(f.positions()[0],1724); // wrapped off-screen card is individually positioned
 const dragged=f.positions().join();f.advance(500);assert.equal(f.positions().join(),dragged);
 f.windowEvents.pointerup(pointer('pointerup',100,22,50));const click=pointer('click',100,22,51);f.trackEvents.click(click);assert.equal(click.prevented,true);
 f.advance(2000);assert.notEqual(f.positions().join(),dragged);
 f.trackEvents.pointerdown(pointer('pointerdown',100,20,2100));f.trackEvents.pointermove(pointer('pointermove',4100,20,2140));assert.ok(f.coverage());f.windowEvents.pointerup(pointer('pointerup',4100,20,2141));f.advance(64000);assert.ok(f.coverage());
});
test('taps remain links, vertical swipes remain page scrolling and interrupted drags cannot freeze autoplay',()=>{
 const f=fixture();const dispose=bindContinuousRibbon(f.track,f);
 f.trackEvents.pointerdown(pointer('pointerdown',100,20));f.windowEvents.pointerup(pointer('pointerup',102,22,30));const tap=pointer('click',102,22,31);f.trackEvents.click(tap);assert.equal(tap.prevented,undefined);
 f.trackEvents.pointerdown(pointer('pointerdown',100,20,100));const vertical=pointer('pointermove',102,90,140);f.trackEvents.pointermove(vertical);assert.equal(vertical.prevented,undefined);
 f.trackEvents.pointerdown(pointer('pointerdown',100,20,200));f.trackEvents.pointermove(pointer('pointermove',20,20,240));f.windowEvents.pointercancel(pointer('pointercancel',20,20,241));const atCancel=f.positions().join();f.advance(1000);assert.notEqual(f.positions().join(),atCancel);
 dispose();assert.deepEqual(f.trackEvents,{});
});
function touch(type,x,y,time=0){const finger={identifier:7,clientX:x,clientY:y};return {type,touches:type==='touchend'||type==='touchcancel'?[]:[finger],changedTouches:[finger],timeStamp:time,cancelable:true,preventDefault(){this.prevented=true;}};}
test('horizontal finger gesture blocks page panning from the first movement and keeps its axis until release',()=>{
 const f=fixture();bindContinuousRibbon(f.track,f);
 f.trackEvents.touchstart(touch('touchstart',300,100));
 const tiny=touch('touchmove',297,101,16);f.trackEvents.touchmove(tiny);assert.equal(tiny.prevented,true);
 const horizontal=touch('touchmove',270,103,32);f.trackEvents.touchmove(horizontal);assert.equal(horizontal.prevented,true);
 const diagonal=touch('touchmove',240,240,48);f.trackEvents.touchmove(diagonal);assert.equal(diagonal.prevented,true);assert.ok(f.coverage());
 // Mobile pointercancel must not release the independent touch lock.
 f.windowEvents.pointercancel({...pointer('pointercancel',240,240,49),pointerType:'touch'});
 const further=touch('touchmove',220,300,64);f.trackEvents.touchmove(further);assert.equal(further.prevented,true);
 f.windowEvents.touchend(touch('touchend',220,300,80));const before=f.positions().join();f.advance(1000);assert.notEqual(f.positions().join(),before);
});
test('a vertical touch gesture keeps native scrolling and never switches into horizontal dragging',()=>{
 const f=fixture();bindContinuousRibbon(f.track,f);f.trackEvents.touchstart(touch('touchstart',200,100));
 const vertical=touch('touchmove',202,125,16);f.trackEvents.touchmove(vertical);assert.equal(vertical.prevented,undefined);
 const later=touch('touchmove',100,145,32);f.trackEvents.touchmove(later);assert.equal(later.prevented,undefined);
 f.windowEvents.touchend(touch('touchend',100,145,48));const tap=pointer('click',100,145,49);f.trackEvents.click(tap);assert.equal(tap.prevented,undefined);
});
test('touch cancellation and pinch gestures release the row and touch pointer events do not move it twice',()=>{
 const f=fixture();bindContinuousRibbon(f.track,f);
 f.trackEvents.touchstart(touch('touchstart',300,100));f.trackEvents.touchmove(touch('touchmove',250,100,16));const once=f.positions().join();
 f.trackEvents.pointermove({...pointer('pointermove',200,100,17),pointerType:'touch',pointerId:7});assert.equal(f.positions().join(),once);
 f.windowEvents.touchcancel(touch('touchcancel',250,100,18));f.advance(1000);assert.notEqual(f.positions().join(),once);
 f.trackEvents.touchstart(touch('touchstart',300,100,1100));const pinch=touch('touchmove',250,100,1116);pinch.touches.push({identifier:8,clientX:350,clientY:100});f.trackEvents.touchmove(pinch);assert.equal(pinch.prevented,undefined);f.advance(64000);assert.ok(f.coverage());
});
