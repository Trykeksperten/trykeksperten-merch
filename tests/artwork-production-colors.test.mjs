import test from 'node:test';
import assert from 'node:assert/strict';
import {artworkColorChanges,assertProductionColors} from '../dist/artwork-production-colors.mjs';
import {pfAssetsForGroup} from '../lib/order-flow.mjs';

test('recoloured originals cannot be handed to PF even with a manual colour override',()=>{
 for(const art of [{color:'#ffffff'},{paletteColors:[{source:'#000000',target:'#ffffff'}]}]){
  const decoration={position:'Bryst',colors:1,artworks:[{...art,logo:{id:'original'}}]};
  assert.throws(()=>pfAssetsForGroup({id:'test',lines:[{decorations:[decoration]}],pfColourOverrides:{'0:0':['Black C']}},{lineIndexes:[0]}),/PF-afsendelse er blokeret/);
 }
});
test('unchanged palettes and original files remain usable',()=>{
 assert.deepEqual(artworkColorChanges({paletteColors:[{source:'#FFFFFF',target:'#ffffff'}]}),[]);
 assert.doesNotThrow(()=>assertProductionColors({artworks:[{logo:{id:'original'}}]}));
 assert.doesNotThrow(()=>assertProductionColors({artworks:[{paletteColors:[{source:'#FFFFFF',target:'#ffffff'}]}]}));
});
