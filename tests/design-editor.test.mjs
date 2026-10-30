import test from 'node:test';
import assert from 'node:assert/strict';
import {designColorCount,suggestedColorCount} from '../dist/design-colors.mjs';
import {normalizeTextPlacement,textPrintSize,artworkPrintSize,normalizeArtworkForOption,designGroupSize,validateArtworkLayers} from '../dist/design-layers.mjs';
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

test('letter spacing changes text proportions and stays inside the print area',()=>{
 const area={impWidthMm:100,impHeightMm:40},base={x:.5,y:.5,scale:.5,font:'Arial',lineSpacing:1.25};
 const normal=textPrintSize('SMERCH',{...base,letterSpacing:0},area),wide=textPrintSize('SMERCH',{...base,letterSpacing:.3},area);
 assert.ok(wide.widthMm/wide.heightMm>normal.widthMm/normal.heightMm);
 for(const letterSpacing of [-.05,0,.3,.5]){const placement=normalizeTextPlacement('SMERCH',{...base,letterSpacing},area);assert.equal(placement.letterSpacing,letterSpacing);const size=textPrintSize('SMERCH',placement,area);assert.ok(size.widthMm<=100&&size.heightMm<=40);}
 assert.equal(normalizeTextPlacement('Old design',base,area).letterSpacing,0);
});
test('server preserves letter spacing and rejects values outside the allowed range',async()=>{
 const product=await loadPFProduct('pf-120632'),variant=product.variants[0],option=variant.options[0];
 const textPlacement=normalizeTextPlacement('TEST',{x:.5,y:.5,scale:.24,letterSpacing:.2},option),size=designGroupSize([],'TEST',textPlacement,option);
 const design={optionId:option.id,width:Math.round(size.widthMm*10)/10,height:Math.round(size.heightMm*10)/10,colors:1,text:'TEST',textPlacement};
 const line={productId:product.id,sku:variant.sku,quantity:25,decorations:[design]};
 assert.equal(sanitizeDesignLine({products:[product]},line).decorations[0].textPlacement.letterSpacing,.2);
 for(const letterSpacing of [-.1,.51,'invalid'])assert.throws(()=>sanitizeDesignLine({products:[product]},{...line,decorations:[{...design,textPlacement:{...textPlacement,letterSpacing}}]}),/Bogstavafstand/);
});

test('line spacing supports continuous slider values and preserves older designs',()=>{
 const option={impWidthMm:100,impHeightMm:80},base={x:.5,y:.5,scale:.5};
 for(const lineSpacing of [.8,1,1.1,1.25,1.5,1.75,2])assert.equal(normalizeTextPlacement('ONE\nTWO',{...base,lineSpacing},option).lineSpacing,lineSpacing);
 const tight=textPrintSize('ONE\nTWO',{...base,lineSpacing:.8},option),loose=textPrintSize('ONE\nTWO',{...base,lineSpacing:2},option);
 assert.ok(loose.heightMm/loose.widthMm>tight.heightMm/tight.widthMm);
 assert.equal(normalizeTextPlacement('OLD',base,option).lineSpacing,1.25);
});

test('server preserves requested text colour codes and rejects codes inconsistent with the preview',async()=>{
 const product=await loadPFProduct('pf-120632'),variant=product.variants[0],option=variant.options[0];
 const textPlacement=normalizeTextPlacement('TEST',{x:.5,y:.5,scale:.24},option),size=designGroupSize([],'TEST',textPlacement,option);
 const design={optionId:option.id,width:Math.round(size.widthMm*10)/10,height:Math.round(size.heightMm*10)/10,colors:1,text:'TEST',textPlacement,ink:'#d45d00',inkSpec:{model:'pantone',code:'717 C'}};
 const line={productId:product.id,sku:variant.sku,quantity:25,decorations:[design]};
 assert.equal(sanitizeDesignLine({products:[product]},line).decorations[0].inkSpec.code,'717 C');
 assert.throws(()=>sanitizeDesignLine({products:[product]},{...line,decorations:[{...design,ink:'#000000'}]}),/farvekode matcher/);
 const cmyk={...design,ink:'#ff0000',inkSpec:{model:'cmyk',values:[0,100,100,0]}};
 assert.deepEqual(sanitizeDesignLine({products:[product]},{...line,decorations:[cmyk]}).decorations[0].inkSpec.values,[0,100,100,0]);
});

test('text formatting survives normalization and server validation, including combined styles',async()=>{
 const product=await loadPFProduct('pf-120632'),variant=product.variants[0],option=variant.options[0];
 for(const flags of [{bold:true,italic:true,underline:true},{bold:false,italic:false,underline:false},{bold:true,italic:false,underline:true}]){
  const textPlacement=normalizeTextPlacement('SMERCH',{x:.5,y:.5,scale:.24,...flags},option),size=designGroupSize([],'SMERCH',textPlacement,option);
  const design={optionId:option.id,width:Math.round(size.widthMm*10)/10,height:Math.round(size.heightMm*10)/10,colors:1,text:'SMERCH',textPlacement};
  const line={productId:product.id,sku:variant.sku,quantity:25,decorations:[design]};
  const saved=sanitizeDesignLine({products:[product]},JSON.parse(JSON.stringify(line))).decorations[0].textPlacement;
  for(const key of ['bold','italic','underline']){
   assert.equal(saved[key],flags[key]);
   assert.throws(()=>sanitizeDesignLine({products:[product]},{...line,decorations:[{...design,textPlacement:{...textPlacement,[key]:'true'}}]}),/formatering/);
  }
 }
 const legacy=normalizeTextPlacement('Ældre tekst',{},option);
 assert.equal(legacy.bold,false);assert.equal(legacy.italic,false);assert.equal(legacy.underline,false);
});
