import test from 'node:test';
import assert from 'node:assert/strict';
import {designColorCount,suggestedColorCount} from '../dist/design-colors.mjs';
import {artworkPrintSize,normalizeArtworkForOption,designGroupSize,validateArtworkLayers} from '../dist/design-layers.mjs';
import {sanitizeDesignLine} from '../lib/design-validation.mjs';
import {loadPFProduct} from '../lib/pf-catalog-store.mjs';
const art={id:'test-art',logo:{id:'test-file',name:'logo.pdf',type:'application/pdf',size:1000,pixelWidth:1000,pixelHeight:100},x:.5,y:.5,scale:1};
test('logo rotation fills a tall print area and updates its group dimensions',()=>{
 const option={impWidthMm:35,impHeightMm:90};
 const rotated=normalizeArtworkForOption({...art,rotation:90},option),size=artworkPrintSize(rotated,option),group=designGroupSize([rotated],'',{},option);
 assert.ok(Math.abs(size.widthMm-90)<.00001);
 assert.ok(Math.abs(group.heightMm-90)<.00001);
 assert.ok(Math.abs(group.widthMm-9)<.00001);
 assert.equal(validateArtworkLayers([rotated],option),'');
 for(const angle of [-180,-90,-45,0,30,90,180]){
  const fitted=normalizeArtworkForOption({...art,rotation:angle,x:1,y:0},option);
  assert.equal(validateArtworkLayers([fitted],option),'');
  const group=designGroupSize([fitted],'',{},option);
  assert.ok(group.widthMm<=35.0001&&group.heightMm<=90.0001);
 }
});
test('two detected colours, palette changes, shared colours and text determine placement count',()=>{
 const a={logo:{detectedColors:2,detectedPalette:[{hex:'#ff6600'},{hex:'#000000'}]}};
 assert.equal(designColorCount([a]),2);
 assert.equal(designColorCount([a,a]),2);
 assert.equal(designColorCount([a],'Text','#ffffff'),3);
 assert.equal(designColorCount([{...a,paletteColors:[{target:'#000000'},{target:'#000000'}]}]),1);
 assert.equal(suggestedColorCount(2,[{colors:1},{colors:2}]),2);
 assert.equal(suggestedColorCount(2,[]),2);
 assert.equal(suggestedColorCount(2,[{colors:1}]),2);
 assert.equal(suggestedColorCount(3,[{colors:1},{colors:4}]),4);
});
test('server retains logo rotation and rejects invalid rotation values',async()=>{
 const product=await loadPFProduct('pf-120632'),variant=product.variants[0],option=variant.options[0];
 const artwork=normalizeArtworkForOption({...art,rotation:90,scale:.4},option),group=designGroupSize([artwork],'',{},option);
 const line={productId:product.id,sku:variant.sku,quantity:25,decorations:[{optionId:option.id,width:Math.round(group.widthMm*10)/10,height:Math.round(group.heightMm*10)/10,colors:1,text:'',artworks:[artwork]}]};
 assert.equal(sanitizeDesignLine({products:[product]},line).decorations[0].artworks[0].rotation,90);
 for(const rotation of [181,-181,'invalid'])assert.throws(()=>sanitizeDesignLine({products:[product]},{...line,decorations:[{...line.decorations[0],artworks:[{...artwork,rotation}]}]}),/rotation/);
});
