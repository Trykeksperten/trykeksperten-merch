import test from 'node:test';
import assert from 'node:assert/strict';
import {foilFinishes,isFoilOption,validateFoilFinish} from '../dist/foil-options.mjs';
import {loadPFProduct} from '../lib/pf-catalog-store.mjs';
import {sanitizeDesignLine} from '../lib/design-validation.mjs';
import {normalizeArtworkForOption,designGroupSize} from '../dist/design-layers.mjs';
import {pfAssetsForGroup} from '../lib/order-flow.mjs';
test('foil requires confirmed supplier codes rather than an ink Pantone mapping',()=>{
 const checkout={id:'pay-11111111-1111-4111-8111-111111111111',lines:[{decorations:[{methodCode:9,foilFinish:'gold',colors:1,text:'TEST',ink:'#17201f',artworks:[]}]}]},group={lineIndexes:[0]},env={SMERCH_PUBLIC_BASE_URL:'https://smerch.dk',SMERCH_ARTWORK_SIGNING_SECRET:'x'.repeat(40),SMERCH_PMS_COLOR_MAP:'{"#17201f":"Black C"}'};
 assert.throws(()=>pfAssetsForGroup(checkout,group,{env}),/PF-foliekoden for Guld/);
 checkout.pfColourOverrides={'0:0':['ConfirmedGold']};
 assert.deepEqual(pfAssetsForGroup(checkout,group,{env})['0:0'].pmsColors,['ConfirmedGold']);
});
test('foil choices are gold and silver, only for hot stamping',()=>{
 assert.deepEqual(foilFinishes.map(f=>f.id),['gold','silver']);
 assert.equal(isFoilOption({impMethodCode:9}),true);
 assert.equal(isFoilOption({impMethod:'Prægning',impMethodCode:8}),false);
 assert.ok(validateFoilFinish({impMethodCode:9},''));
 assert.ok(validateFoilFinish({impMethodCode:9},'copper'));
 assert.ok(validateFoilFinish({impMethodCode:1},'gold'));
});
test('Karst foil selection survives server validation; multiple source colours become one foil',async()=>{
 const p=await loadPFProduct('pf-107790'),v=p.variants[0],o=v.options.find(isFoilOption);
 const artwork=normalizeArtworkForOption({id:'foil-art',logo:{id:'foil-logo',name:'logo.pdf',type:'application/pdf',size:100,pixelWidth:1000,pixelHeight:200,detectedColors:2,detectedPalette:[{hex:'#000000',share:.5},{hex:'#ff6600',share:.5}]},x:.5,y:.5,scale:.4},o);
 const group=designGroupSize([artwork],'',{},o),decoration={optionId:o.id,width:Math.round(group.widthMm*10)/10,height:Math.round(group.heightMm*10)/10,colors:1,text:'',artworks:[artwork]};
 const line=finish=>({productId:p.id,sku:v.sku,quantity:25,decorations:[{...decoration,foilFinish:finish}]});
 for(const finish of ['gold','silver']){
  const result=sanitizeDesignLine({products:[p]},line(finish));
  assert.equal(result.decorations[0].foilFinish,finish);
  assert.equal(result.decorations[0].colors,1);
 }
 for(const finish of [undefined,'copper'])assert.throws(()=>sanitizeDesignLine({products:[p]},line(finish)),/guld eller sølv/);
});
