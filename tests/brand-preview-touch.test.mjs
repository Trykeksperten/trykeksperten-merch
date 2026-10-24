import test from 'node:test';
import assert from 'node:assert/strict';
import {brandPreview,bindBrandPreview} from '../dist/brands.mjs';
test('brand ribbon retains native links and resumes a previously paused track without touch pauses',()=>{
 const track={style:{animationPlayState:'paused'}},root={querySelectorAll:()=>[track]};
 const html=brandPreview([{id:'thule',name:'Thule'},{id:'parker',name:'Parker'}]);
 assert.equal((html.match(/class="brand-marquee-group"/g)||[]).length,2);
 for(const brand of ['thule','parker'])assert.equal((html.match(new RegExp('href="/produkter\\?brand='+brand+'"','g'))||[]).length,2);
 assert.match(html,/aria-hidden="true"/);assert.match(html,/tabindex="-1"/);
 bindBrandPreview(root);assert.equal(track.style.animationPlayState,'running');bindBrandPreview(root);assert.equal(track.style.animationPlayState,'running');
});

test('the ribbon has no manual playback control',()=>{const html=brandPreview([{id:'thule',name:'Thule'}]);assert.ok(!html.includes('Afspil'));assert.ok(!html.includes('<button'));});
