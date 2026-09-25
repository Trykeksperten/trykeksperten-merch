import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDecoration} from '../dist/pf-rules.mjs';
import {logoPreflight} from '../dist/logo-preflight.mjs';
import {normalizeArtwork,normalizeArtworkForOption,normalizeTextPlacement,artworkPrintSize,textPrintSize,rotatedTextBounds,fitArtworkToOption,artworkGroupSize,designGroupSize,artworkFitsOption,printableBounds,containMappedBounds,validateArtworkLayers,overallArtworkPreflight} from '../dist/design-layers.mjs';
import {preparePreview,generatePreview} from '../lib/ai-preview.mjs';
import {sanitizeDesignLine,validateDesignLine} from '../lib/design-validation.mjs';
import {iteratePFProducts,loadCatalogIndex,loadPFProduct} from '../lib/pf-catalog-store.mjs';
import {parsePFPlacementSVG,stripPFPlacementGuide} from '../lib/pf-placement.mjs';
import {isPdfCompatible} from '../dist/vector-preview.mjs';
import {placementOptionAssets} from '../dist/pf-rules.mjs';
import {availableTextFonts} from '../dist/pf-text.mjs';
const catalogIndex=await loadCatalogIndex(),p=await loadPFProduct('pf-120632'),catalog={...catalogIndex,products:[p]},v=p.variants[0],o=v.options[0];
const valid={width:20,height:10,colors:1,text:'TEST'};
test('PDF-compatible AI files can be identified for an in-browser preview',async()=>{
 assert.equal(await isPdfCompatible(new Blob(['%PDF-1.6\n'])) ,true);
 assert.equal(await isPdfCompatible(new Blob(['%!PS-Adobe\n'])),false);
});
test('full catalogue covers every available brand, curated additions and preserves unique SKUs',()=>{
 assert.ok(Object.keys(catalogIndex.counts).length>=40);assert.ok(Object.values(catalogIndex.counts).every(n=>n>0));
 const elevate=catalogIndex.products.filter(p=>p.brandId==='elevate'),elevateCaps=elevate.filter(p=>p.shopCategory==='caps');
 assert.ok(elevate.length>=120);assert.ok(elevateCaps.length>=23);assert.ok(elevateCaps.every(p=>['Caps & hatte','Huer'].includes(p.category)));
 for(const code of ['38238','38239','39562'])assert.ok(elevate.some(p=>p.modelCode===code),`Mangler Elevate-model ${code}`);
 assert.equal(catalogIndex.products.length,Object.values(catalogIndex.counts).reduce((a,b)=>a+b,0));
 for(const code of ['120331','120711','120712','120745','120749','130154','130155','130156','106299','106378','107822','100798'])assert.ok(catalogIndex.products.some(p=>p.modelCode===code),`Mangler kurateret model ${code}`);
 for(const code of ['119179','120131','120135','120332','120695','120760','1PZ049','1PZ050'])assert.ok(catalogIndex.products.some(p=>p.modelCode===code),`Mangler vist mulepose ${code}`);
 for(const code of ['119179','120131','120135','120331','120332','120695','120711','120712','120749','120760','1PZ049','1PZ050'])assert.equal(catalogIndex.products.find(p=>p.modelCode===code)?.shopCategory,'bomuldstasker');
 const variants=catalogIndex.products.flatMap(p=>p.variants);assert.ok(variants.length>=catalogIndex.products.length);assert.equal(new Set(variants.map(v=>v.sku)).size,variants.length);assert.ok(variants.every(variant=>variant.discontinued===false));
});
test('print dimensions, area, colour count and missing artwork are validated',()=>{
 assert.equal(validateDecoration(o,valid),'');assert.ok(validateDecoration(o,{...valid,width:999}));assert.ok(validateDecoration(o,{...valid,colors:999}));assert.ok(validateDecoration(o,{...valid,text:''}));assert.ok(validateDecoration(null,valid));
 assert.ok(validateDecoration({...o,maxLogoSizeCm2:1},valid));
 assert.ok(validateDecoration({...o,impWidthMm:0,impHeightMm:0,impDiameterMm:20},{...valid,width:20,height:20}));
 assert.equal(validateDecoration({...o,maxColours:'Full colour'},valid),'');
});
test('logo preflight approves production resolution and rejects unusable artwork',()=>{
 assert.equal(logoPreflight({type:'image/png',pixelWidth:1200,pixelHeight:600,widthMm:80,heightMm:40}).status,'approved');
 assert.equal(logoPreflight({type:'image/jpeg',pixelWidth:200,pixelHeight:100,widthMm:100,heightMm:50}).status,'rejected');
 assert.equal(logoPreflight({type:'application/pdf',widthMm:100,heightMm:50}).status,'review');
 assert.equal(logoPreflight({type:'image/svg+xml',widthMm:100,heightMm:50}).status,'review');
 assert.equal(logoPreflight({type:'application/postscript',widthMm:100,heightMm:50}).status,'review');
 assert.equal(logoPreflight({type:'application/vnd.corel-draw',widthMm:100,heightMm:50}).status,'review');
 assert.equal(logoPreflight({hasText:true,widthMm:100,heightMm:50}).status,'approved');
});
test('design layers stay inside the product canvas and combine technical status',()=>{
 assert.deepEqual(normalizeArtwork({id:'a',x:-2,y:4,scale:2}),{id:'a',x:.04,y:.96,scale:1});
 assert.equal(overallArtworkPreflight([{status:'approved',checks:['ok']},{status:'review',checks:['check']}]).status,'review');
 assert.equal(overallArtworkPreflight([{status:'approved',checks:['ok']},{status:'rejected',checks:['bad']}]).status,'rejected');
 assert.equal(overallArtworkPreflight([],true).status,'approved');
 assert.equal(overallArtworkPreflight([],false).status,'missing');
});
test('PF coordinates define the printable zone and artwork gets physical dimensions',()=>{
 const option={impWidthMm:120,impHeightMm:60,coorTopLeftX:279,coorTopLeftY:1164,coorTopRightX:1140,coorTopRightY:1164,coorBottomLeftX:279,coorBottomLeftY:2130,coorBottomRightX:1140,coorBottomRightY:2130};
 assert.deepEqual(printableBounds(option,473,799),{x:279/1419,y:1164/2397,width:861/1419,height:966/2397,source:'coordinates'});
 const art={id:'logo',logo:{id:'file',name:'logo.png',pixelWidth:1200,pixelHeight:600},x:.98,y:.02,scale:.5};
 assert.deepEqual(artworkPrintSize(art,option),{widthMm:60,heightMm:30,widthFraction:.5,heightFraction:.5,aspect:2});
 assert.deepEqual(normalizeArtworkForOption(art,option),{...art,x:.75,y:.25,scale:.5});
 assert.deepEqual(artworkPrintSize(fitArtworkToOption(art,option),option),{widthMm:120,heightMm:60,widthFraction:1,heightFraction:1,aspect:2});
 assert.ok(validateArtworkLayers([art],option));
 assert.equal(validateArtworkLayers([normalizeArtworkForOption(art,option)],option),'');
 assert.deepEqual(artworkGroupSize([{...art,x:.25,y:.5},{...art,x:.75,y:.5}],option),{widthMm:120,heightMm:30});
 assert.equal(printableBounds({},0,0).source,'fallback');
});
test('placement mockups are tied to the current PF model and require physical dimensions',()=>{
 const assets=placementOptionAssets(p,o);assert.equal(assets.ready,true);assert.match(assets.svg||assets.image,new RegExp(p.modelCode,'i'));
 assert.equal(placementOptionAssets({...p,modelCode:'WRONG-MODEL'},o).ready,false);
 assert.equal(placementOptionAssets(p,{...o,impWidthMm:0,impHeightMm:0,impDiameterMm:0}).ready,false);
 assert.equal(placementOptionAssets(p,{...o,svg:null,image:null}).ready,false);
});
test('printable bounds account for object-fit contain letterboxing',()=>{
 const mapped=containMappedBounds({x:.2,y:.4,width:.6,height:.4,source:'coordinates'},500,800,800,800);
 assert.deepEqual(mapped,{x:.3125,y:.4,width:.375,height:.4,source:'coordinates'});
});
test('PF SVG marker is the authoritative printable zone',()=>{
 const svg='<svg width="663" height="800" viewBox="0 0 663 800"><path style="fill:none;stroke:#00ff00" d="M 404 151 L 404 185 L 488 185 L 488 151 L 404 151 z"><metadata/></path></svg>';
 assert.deepEqual(parsePFPlacementSVG(svg),{x:404/663,y:151/800,width:84/663,height:34/800,source:'svg'});
 assert.ok(!stripPFPlacementGuide(svg).includes('#00ff00'));
 assert.throws(()=>parsePFPlacementSVG('<svg width="10" height="10"></svg>'));
});
test('round print areas keep every logo corner inside the circle',()=>{
 const option={impDiameterMm:40},art={id:'round',logo:{id:'file',name:'round.png',pixelWidth:1000,pixelHeight:1000},x:.95,y:.95,scale:.8},normalized=normalizeArtworkForOption(art,option),size=artworkPrintSize(normalized,option);
 assert.ok(Math.hypot(size.widthFraction,size.heightFraction)<=1.0001);
 assert.ok(Math.hypot(normalized.x-.5,normalized.y-.5)+Math.hypot(size.widthFraction/2,size.heightFraction/2)<=.5001);
 assert.equal(artworkFitsOption(art,option),false);
 assert.equal(artworkFitsOption(normalized,option),true);
 assert.equal(validateArtworkLayers([normalized],option),'');
 const text=normalizeTextPlacement('Rund tekst',{x:1,y:1,scale:1},option),textSize=designGroupSize([],'Rund tekst',text,option);
 assert.ok(text.x<1&&text.y<1);assert.ok(textSize.widthMm<=40&&textSize.heightMm<=40);
});
test('every catalogue placement produces finite printable bounds and legal normalized artwork',async()=>{
 let checked=0;
 for await(const product of iteratePFProducts())for(const variant of product.variants)for(const option of variant.options){
  const bounds=printableBounds(option,2048,2048);for(const value of [bounds.x,bounds.y,bounds.width,bounds.height])assert.ok(Number.isFinite(value)&&value>=0&&value<=1,`${variant.sku} ${option.id}`);
  const artwork=normalizeArtworkForOption({id:'catalog-check',logo:{id:'file',name:'logo.png',pixelWidth:1200,pixelHeight:600},x:9,y:-9,scale:9},option);
  assert.equal(artworkFitsOption(artwork,option),true,`${variant.sku} ${option.id}`);checked++;
 }
 assert.ok(checked>250000);
});
test('server design validation derives authoritative print data and rejects forged layers',()=>{
 const baseArtwork={id:'art-1',logo:{id:'file-1',name:'logo.pdf',type:'application/pdf',size:120000,pixelWidth:1200,pixelHeight:600},x:.5,y:.5,scale:.3},normalized=normalizeArtworkForOption(baseArtwork,o),textPlacement={x:.5,y:.5,scale:.24},group=designGroupSize([normalized],'Mit brand',textPlacement,o);
 const line={productId:p.id,sku:v.sku,quantity:25,decorations:[{optionId:o.id,method:'Gratis tryk',position:'Et andet sted',printCode:'FREE',width:Math.round(group.widthMm*10)/10,height:Math.round(group.heightMm*10)/10,colors:1,text:'Mit brand',ink:'#112233',textPlacement,artworks:[normalized]}]},clean=sanitizeDesignLine(catalog,line),design=clean.decorations[0];
 assert.equal(design.method,o.impMethod);assert.equal(design.position,o.impLocation);assert.equal(design.printCode,o.printCode);assert.equal(design.preflight.status,'review');
 const recolored={...line,decorations:[{...line.decorations[0],artworks:[{...normalized,color:'#C85127'}]}]};
 assert.equal(sanitizeDesignLine(catalog,recolored).decorations[0].artworks[0].color,'#c85127');
 assert.equal(validateDesignLine(catalog,{...line,decorations:[{...line.decorations[0],artworks:[{...normalized,color:'red'}]}]}),'Logoets farveønske er ugyldigt.');
 assert.equal(validateDesignLine(catalog,{...line,decorations:[{...line.decorations[0],width:1}]}),'Designets samlede trykmål stemmer ikke med lagene.');
 assert.ok(validateDesignLine(catalog,{...line,decorations:[{...line.decorations[0],artworks:[{...normalized,x:99}]}]}));
 assert.ok(validateDesignLine(catalog,{...line,decorations:[{...line.decorations[0],artworks:[{...normalized,logo:{...normalized.logo,size:6*1024*1024}}]}]}));
 assert.ok(validateDesignLine(catalog,{...line,decorations:[{...line.decorations[0],artworks:[{...normalized,logo:{...normalized.logo,pixelWidth:100001}}]}]}));
 assert.match(validateDesignLine(catalog,{...line,decorations:[{...line.decorations[0],artworks:[{...normalized,logo:{...normalized.logo,name:'logo.png',type:'image/png'}}]}]}),/EPS-, CDR-, PDF- eller AI-fil/);
 assert.ok(validateDesignLine(catalog,{...line,decorations:[line.decorations[0],line.decorations[0]]}));
 assert.equal(validateDesignLine(catalog,{...line,decorations:[{...line.decorations[0],textPlacement:{x:2,y:2,scale:.24}}]}),'Tekstens placering er ugyldig.');
 const badOption={...o,id:'bad-placement',svg:null,image:null},badCatalog={...catalog,products:[{...p,variants:[{...v,options:[badOption]}]}]};assert.match(validateDesignLine(badCatalog,{...line,decorations:[{...line.decorations[0],optionId:badOption.id}]}),/mangler et gyldigt mockup/);
});
test('PF text fonts, alignment and multiline spacing survive design validation',()=>{
 assert.deepEqual(availableTextFonts({impMethod:'Lasergravering'}),['Arial','Times New Roman','Helvetica','Calibri','Futura','Lucida Calligraphy','Myriad Pro']);
 assert.deepEqual(availableTextFonts({impMethod:'Broderi fixed'}),['Arial','Times New Roman','Helvetica','Calibri','Futura']);
 const text='Din jubilæums\nbøsse',textPlacement={x:.5,y:.5,scale:.24,font:'Lucida Calligraphy',align:'right',lineSpacing:1.5,rotation:90},group=designGroupSize([],text,textPlacement,o),line={productId:p.id,sku:v.sku,quantity:25,decorations:[{optionId:o.id,width:Math.round(group.widthMm*10)/10,height:Math.round(group.heightMm*10)/10,colors:1,text,textPlacement,artworks:[]}]};
 assert.deepEqual(sanitizeDesignLine(catalog,line).decorations[0].textPlacement,textPlacement);
 assert.match(validateDesignLine(catalog,{...line,decorations:[{...line.decorations[0],textPlacement:{...textPlacement,font:'Comic Sans MS'}}]}),/tilladt skrifttype/);
 assert.match(validateDesignLine(catalog,{...line,decorations:[{...line.decorations[0],textPlacement:{...textPlacement,rotation:270}}]}),/rotation/);
 assert.ok(group.heightMm>0);
});

test('rotated text fits a tall print area and remains inside its bounds',()=>{
 const tall={impWidthMm:50,impHeightMm:120},text='Joakim Sarsgaard',normal=normalizeTextPlacement(text,{x:.05,y:.05,scale:.6,rotation:90},tall),size=textPrintSize(text,normal,tall),bounds=rotatedTextBounds(size,normal.rotation,tall);
 assert.equal(normal.rotation,90);
 assert.ok(size.widthFraction>1,'the horizontal text can span more than the narrow print width before rotation');
 assert.ok(bounds.widthFraction<=.95+1e-9&&bounds.heightFraction<=.95+1e-9);
 assert.ok(normal.x-bounds.widthFraction/2>=-1e-9&&normal.y-bounds.heightFraction/2>=-1e-9);
 assert.ok(normal.x+bounds.widthFraction/2<=1+1e-9&&normal.y+bounds.heightFraction/2<=1+1e-9);
 const group=designGroupSize([],text,normal,tall);
 assert.ok(Math.abs(group.widthMm-bounds.widthFraction*tall.impWidthMm)<1e-9);
 assert.ok(Math.abs(group.heightMm-bounds.heightFraction*tall.impHeightMm)<1e-9);
 const short=normalizeTextPlacement('Tese',{x:.5,y:.5,scale:1,font:'Lucida Calligraphy',rotation:90},tall),shortBounds=rotatedTextBounds(textPrintSize('Tese',short,tall),short.rotation,tall);
 assert.ok(shortBounds.heightFraction>.9,'a short vertical word can use almost the full print height');
 assert.ok(shortBounds.widthFraction<=.95+1e-9,'the larger word still fits the narrow print width');
});
test('AI uses the exact supplier variant and placement and rejects forged IDs and remote logos',()=>{
 const input={...valid,productId:p.id,sku:v.sku,optionId:o.id,scene:'studio'};
 const request=preparePreview(catalog,input);assert.equal(request.images[0].image_url,v.images[0]);assert.equal(request.images[1].image_url,o.image);assert.ok(request.prompt.includes(v.sku));
 assert.throws(()=>preparePreview(catalog,{...input,sku:'not-a-sku'}));assert.throws(()=>preparePreview(catalog,{...input,logoData:'https://example.com/logo.png'}));assert.throws(()=>preparePreview(catalog,{...input,width:999}));
});
test('AI remains unavailable without explicit activation and makes no request',async()=>{
 const prior=process.env.AI_ENABLED;process.env.AI_ENABLED='0';try{await assert.rejects(generatePreview(catalog,{}),/ikke aktiveret/);}finally{if(prior===undefined)delete process.env.AI_ENABLED;else process.env.AI_ENABLED=prior;}
});

test('blank product choice contains no artwork or print settings and respects PF restrictions',async()=>{
 const {blankProductSelection}=await import('../dist/pf-rules.mjs');
 const selection=blankProductSelection(p,{...v,decorationMandatory:false},12);
 assert.equal(selection.decoration,'none');assert.equal(selection.quantity,12);assert.equal(selection.sku,v.sku);assert.equal(selection.logo,undefined);assert.equal(selection.printCode,undefined);
 assert.throws(()=>blankProductSelection(p,{...v,decorationMandatory:true},12));
 assert.throws(()=>blankProductSelection(p,{...v,decorationMandatory:undefined},12));
 for(const quantity of [0,-1,1.5,NaN])assert.throws(()=>blankProductSelection(p,{...v,decorationMandatory:false},quantity));
});
