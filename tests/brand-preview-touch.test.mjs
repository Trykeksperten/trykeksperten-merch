import test from 'node:test';
import assert from 'node:assert/strict';
import {brandPreview,bindBrandPreview} from '../dist/brands.mjs';
test('brand ribbon keeps native product links and pauses its moving target during a mobile tap',()=>{
 const originals={matchMedia:globalThis.matchMedia,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};const handlers={},track={dataset:{},style:{},isConnected:true,addEventListener:(name,fn)=>handlers[name]=fn},root={querySelectorAll:()=>[track]};let mobile=true,resume;
 globalThis.matchMedia=()=>({matches:mobile});globalThis.setTimeout=fn=>{resume=fn;return 1;};globalThis.clearTimeout=()=>{};
 try{const html=brandPreview([{id:'thule',name:'Thule'}]);assert.ok(html.includes('href="/produkter?brand=thule"'));assert.equal((html.match(/href=/g)||[]).length,2);bindBrandPreview(root);const originalHandler=handlers.pointerdown;bindBrandPreview(root);assert.equal(handlers.pointerdown,originalHandler);handlers.pointerdown({preventDefault(){throw Error('Native navigation must remain available');}});assert.equal(track.style.animationPlayState,'paused');handlers.pointerup();assert.equal(track.style.animationPlayState,'paused');resume();assert.equal(track.style.animationPlayState,'');mobile=false;handlers.pointerdown();assert.equal(track.style.animationPlayState,'');
 }finally{Object.assign(globalThis,originals);}
});
