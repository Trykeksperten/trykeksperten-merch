import test from 'node:test';
import assert from 'node:assert/strict';
import {nearestPantone,artworkPantoneRows} from '../dist/pantone-match.mjs';
import {decorationPantone} from '../lib/artwork-pantone.mjs';
test('orange logo RGB suggests 717 C without claiming an embedded colour',()=>{
 const result=nearestPantone('#dd5d05');assert.equal(result.code,'717 C');assert.equal(result.status,'suggested');
 assert.equal(nearestPantone('#dc6400').code,'717 C');
 assert.equal(nearestPantone('invalid'),null);
});
test('embedded spot names take precedence; recolouring invalidates original colours',()=>{
 const art={logo:{pantone:{status:'verified',codes:['186 C']},detectedPalette:[{hex:'#dd5d05'}]}};
 assert.deepEqual(artworkPantoneRows(art).map(r=>[r.code,r.status]),[['186 C','verified']]);
 art.color='#dd5d05';assert.equal(artworkPantoneRows(art)[0].code,'717 C');assert.equal(artworkPantoneRows(art)[0].status,'suggested');
 delete art.color;art.logo.pantone.status='manual';assert.equal(artworkPantoneRows(art)[0].status,'candidate');
});
test('suggestions cannot become verified supplier colour codes',()=>{
 const art={logo:{id:'logo',detectedPalette:[{hex:'#dd5d05'}]}};
 assert.equal(artworkPantoneRows(art)[0].status,'suggested');
 assert.equal(decorationPantone({colors:1,artworks:[art]},[]).status,'manual');
 assert.deepEqual(artworkPantoneRows({logo:{}}),[]);
});
test('automatic Pantone suggestion never recolours the original or blocks production',async()=>{
 const {assertProductionColors}=await import('../dist/artwork-production-colors.mjs');
 const art={logo:{id:'orange',detectedPalette:[{hex:'#ff5000',share:1}]}};
 const before=structuredClone(art);
 const rows=artworkPantoneRows(art);
 assert.equal(rows[0].status,'suggested');
 assert.deepEqual(art,before);
 assert.doesNotThrow(()=>assertProductionColors({artworks:[art]}));
});
