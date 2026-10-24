import test from 'node:test';
import assert from 'node:assert/strict';
import {bindContinuousRibbon} from '../dist/brand-ribbon-motion.mjs';
function fixture(width=148,viewport=390){
 let size=width,id=0,now=0;const callbacks=new Map(),windowEvents={},documentEvents={};
 const cards=Array.from({length:13},()=>({style:{},getBoundingClientRect:()=>({width:size,height:152})}));
 const track={isConnected:true,style:{},dataset:{},querySelector:()=>({querySelectorAll:()=>cards})};
 const win={requestAnimationFrame:f=>{callbacks.set(++id,f);return id;},cancelAnimationFrame:id=>callbacks.delete(id),addEventListener:(k,f)=>windowEvents[k]=f,removeEventListener:k=>delete windowEvents[k]};
 const doc={hidden:false,addEventListener:(k,f)=>documentEvents[k]=f,removeEventListener:k=>delete documentEvents[k]};
 const positions=()=>cards.map(card=>Number(card.style.transform.match(/translateX\(([^p]+)/)[1]));
 const coverage=()=>{const xs=positions().sort((a,b)=>a-b);let edge=0;for(const x of xs){if(x>edge+.001)break;if(x+size>edge)edge=x+size;}return edge>=viewport-.001;};
 return {track,win,doc,windowEvents,documentEvents,cards,positions,coverage,resize:(w,v)=>{size=w;viewport=v;windowEvents.resize();},frames:()=>callbacks.size,advance:ms=>{for(let elapsed=0;elapsed<ms;elapsed+=16){now+=16;const frames=[...callbacks.values()];callbacks.clear();frames.forEach(f=>f(now));if(track.isConnected&&!doc.hidden)assert.ok(coverage(),'cards cover the viewport at every frame');}}};
}
test('individual cards cover mobile and desktop for ten full loops without moving a wide parent layer',()=>{
 for(const [width,viewport] of [[148,390],[281.6,1280]]){const f=fixture(width,viewport);const dispose=bindContinuousRibbon(f.track,f);assert.equal(bindContinuousRibbon(f.track,f),dispose);assert.equal(f.track.dataset.ribbonMotion,'cards');assert.equal(f.track.style.transform,'');f.advance(320016);assert.equal(f.frames(),1);assert.ok(f.positions().every(x=>x>=-width&&x<=width*12));dispose();assert.equal(f.frames(),0);}
});
test('rotation, backgrounding and back navigation resume with one timer and clean up on navigation',()=>{
 const f=fixture();bindContinuousRibbon(f.track,f);f.advance(8016);const position=f.positions()[0]/148;f.resize(280,1280);assert.ok(Math.abs(f.positions()[0]/280-position)<.00001);assert.ok(f.coverage());f.doc.hidden=true;f.documentEvents.visibilitychange();assert.equal(f.frames(),0);f.advance(60000);f.doc.hidden=false;f.documentEvents.visibilitychange();f.windowEvents.pageshow();assert.equal(f.frames(),1);f.advance(64000);f.track.isConnected=false;f.advance(16);assert.equal(f.frames(),0);assert.equal(f.track.dataset.ribbonMotion,undefined);assert.deepEqual(f.windowEvents,{});assert.deepEqual(f.documentEvents,{});
});
