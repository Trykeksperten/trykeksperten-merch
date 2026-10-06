import test from 'node:test';
import assert from 'node:assert/strict';
import {listPFPrintPrices,listPFProductPrices,listPFProductTiers,listPFStock,normalizePrices,normalizeStock,estimatePFLine,quotePFLine,quotePFCart,supplierPFOrderAmounts,validateCartLine} from '../lib/pf-pricing.mjs';
import {designGroupSize} from '../dist/design-layers.mjs';
import {loadCatalogIndex,loadPFProduct} from '../lib/pf-catalog-store.mjs';
import {isShopProduct,isQuoteOnlyProduct,isComingSoonProduct,shopProducts,pricedVariants} from '../dist/pf-visibility.mjs';
import {placementColourOptions,hasColourDependentSetup} from '../dist/pf-colour-options.mjs';
import {prepareOrder,applyPFNotification,recordProof,readProofFile,decideProof,recordExternalApproval} from '../lib/pf-orders.mjs';
import {rm} from 'node:fs/promises';
const catalogIndex=await loadCatalogIndex(),p=await loadPFProduct('pf-120632'),catalog={...catalogIndex,products:[p]},v=p.variants[0],o=v.options[0];
const now=Date.parse('2026-09-17T12:00:00Z');
// Synthetic prices only for calculation tests; never installed in the application.
const goods={priceInfo:[{creationDateTime:'2026-09-17T05:00:00Z',models:[{model:[{modelcode:p.modelCode,items:[{item:[{itemcode:v.sku,currency:'DKK',minDecoQty:25,scales:[{scale:[{priceBar:1,nettPrice:100},{priceBar:50,nettPrice:80}]}]}]}]}]}]}]};
const print={decoCharges:[{createdDateTime:'2026-09-17T05:00:00Z',currency:'DKK',decoCharge:[{printCode:o.printCode,LTMCharge:30,priceDependence:'None',logoSizes:[{logoSize:[{logoSizeCm2:0,amountColors:[{amountColor:[{amountColorsId:1,amountSetupCharges:[{amountSetupCharge:[{AmountSetupChargeId:1,SetupCharge:100,decoPrices:[{decoPrice:[{decoPriceFromQty:1,price:10},{decoPriceFromQty:50,price:8}]}]}]}]}]}]}]}]}]}]};
const prices=normalizePrices(goods,print),rules={goodsMarkup:50,printMarkup:100};
const blank={productId:p.id,sku:v.sku,quantity:10,decorations:[]};
const textPlacement={x:.5,y:.5,scale:.24},textSize=designGroupSize([],'TEST',textPlacement,o),decorated={...blank,decorations:[{optionId:o.id,width:Math.round(textSize.widthMm*10)/10,height:Math.round(textSize.heightMm*10)/10,colors:1,text:'TEST',textPlacement}]};
test('blank goods use quantity tier and never charge printing or setup',()=>{const q=quotePFLine(catalog,blank,prices,rules,now);assert.equal(q.goods,150000);assert.equal(q.print,0);assert.equal(q.setup,0);assert.equal(q.totalIncVat,187500);assert.equal(quotePFLine(catalog,{...blank,quantity:50},prices,rules,now).goods,600000);});
test('a one-piece price tier does not override the decorated minimum without a less-than-minimum charge',()=>{
 const current=structuredClone(prices);current.prints[o.printCode].ltm=0;
 assert.equal(listPFProductTiers(catalog,p.id,v.sku,current,rules,now).minimumQuantity,1);
 assert.ok(quotePFLine(catalog,{...blank,quantity:1},current,rules,now).totalIncVat>0);
 const below={...decorated,quantity:1};
 assert.match(quotePFLine(catalog,below,current,rules,now).message,/mindst 25 stk/);
 assert.equal(listPFPrintPrices(catalog,p.id,v.sku,1,current,rules,now).available,false);
 assert.throws(()=>supplierPFOrderAmounts(catalog,[below],current,now),/under 25 stk/);
 assert.ok(quotePFLine(catalog,{...decorated,quantity:25},current,rules,now).totalIncVat>0);
});
test('decoration-required products start at their confirmed decorated minimum',()=>{
 const required={...p,variants:[{...v,decorationMandatory:true}]},requiredCatalog={...catalog,products:[required]};
 const result=listPFProductTiers(requiredCatalog,p.id,v.sku,prices,rules,now);
 assert.equal(result.minimumQuantity,25);
 assert.equal(result.tiers[0].min,25);
 assert.equal(listPFProductPrices(requiredCatalog,prices,rules,now).products[p.id].fromQuantity,25);
});
test('decorated totals include rounded startup once per placement and the small-order fee',()=>{const q=quotePFLine(catalog,decorated,prices,rules,now);assert.equal(q.print,20000);assert.equal(q.setup,13000);assert.equal(q.net,183000);assert.equal(q.vat,45750);assert.equal(q.totalIncVat,228750);const many=quotePFLine(catalog,{...decorated,quantity:50},prices,rules,now);assert.equal(many.setup,10000);assert.equal(many.print,80000);});
test('Gateway procurement total uses PF net goods, print and setup rather than customer markup',()=>{const supplier=supplierPFOrderAmounts(catalog,[decorated],prices,now);assert.deepEqual(supplier,{unitPrices:[100],total:1230,currency:'DKK'});assert.ok(supplier.total*100<quotePFLine(catalog,decorated,prices,rules,now).net);});
test('PF proof versions invalidate older Smerch approvals and wait for PF confirmation',async()=>{const fresh=structuredClone(prices),created=new Date().toISOString();fresh.productDate=created;fresh.printDate=created;const stock={updatedAt:created,items:{[v.sku]:{available:100}}},input={lines:[decorated],shipping:{name:'Joakim',email:'joakim@example.dk',phone:'12345678',address:{street:'Testvej 1',postalCode:'1000',city:'København',country:'DK'}},assets:{'0:0':{pmsColors:['Black C'],files:{raw:'https://example.dk/raw.pdf',proof:'https://example.dk/proof.pdf'}}}};let order;try{order=await prepareOrder(input,{catalog,prices:fresh,rules,stock,env:{PF_GATEWAY_SENDER_ID:'SMERCH',PF_COMMUNICATION_EMAIL:'proof@example.dk',PF_GATEWAY_MODE:'test'}});const notice={messageId:'pf-confirm-1',reference:order.purchaseOrderNumber,orderNumber:1234};const confirmed=await applyPFNotification('confirmation',notice);assert.equal(confirmed.status,'awaiting_proof');assert.equal((await applyPFNotification('confirmation',notice)).events.length,confirmed.events.length);const withProof=await recordProof(order.id,{proofReference:'PF-1',proofUrl:'https://example.dk/proof.pdf'});assert.equal(withProof.status,'proof_received');await assert.rejects(recordExternalApproval(order.id,{pfApprovalReference:'PF-approval-1'}),/godkendes hos Smerch/);const approved=await decideProof(order.id,{version:1,decision:'approve'});assert.equal(approved.status,'approval_pending_pf');assert.equal((await applyPFNotification('confirmation',{...notice,messageId:'late-confirm'})).status,'approval_pending_pf');const pdf=Buffer.from('%PDF-1.4\n1 0 obj\nendobj\n');const newer=await recordProof(order.id,{purchaseOrderNumber:order.purchaseOrderNumber,proofReference:'PF-2',contentBase64:pdf.toString('base64'),mimeType:'application/pdf',messageId:'mail-2',source:'inbox'});assert.equal(newer.proof.version,2);assert.equal(newer.status,'proof_received');assert.deepEqual((await readProofFile(order.id,2)).data,pdf);assert.equal((await recordProof(order.id,{purchaseOrderNumber:order.purchaseOrderNumber,proofReference:'PF-2',contentBase64:pdf.toString('base64'),mimeType:'application/pdf',messageId:'mail-2',source:'inbox'})).proof.version,2);await assert.rejects(decideProof(order.id,{version:1,decision:'approve'}),/seneste/);await assert.rejects(recordExternalApproval(order.id,{pfApprovalReference:'PF-approval-1'}),/godkendes hos Smerch/);await decideProof(order.id,{version:2,decision:'approve'});const confirmedByPf=await recordExternalApproval(order.id,{pfApprovalReference:'PF-approval-2'});assert.equal(confirmedByPf.status,'approval_recorded');const processing=await applyPFNotification('status',{StatusChangedNotification:{messageId:'pf-status-1',poNumber:order.purchaseOrderNumber,statusCode:'PROCESSING'}});assert.equal(processing.status,'processing');}finally{if(order){await rm(new URL(`../.private/orders/${order.id}.json`,import.meta.url),{force:true});await rm(new URL(`../.private/proofs/${order.id}/`,import.meta.url),{recursive:true,force:true});}}});
test('missing, stale and unconfigured prices remain unknown, never free',()=>{for(const [data,rule]of [[null,rules],[prices,null],[{...prices,productDate:'2020-01-01'},rules]])assert.equal(quotePFLine(catalog,blank,data,rule,now).totalIncVat,null);const mixed=quotePFCart(catalog,[blank,{...blank,sku:'missing'}],prices,rules,now);assert.equal(mixed.totalIncVat,null);assert.equal(mixed.knownIncVat,187500);assert.equal(quotePFCart(catalog,[],null,null,now).totalIncVat,0);});
test('forged prices and print codes from the client are ignored; invalid configurations rejected',()=>{const q=quotePFLine(catalog,{...decorated,price:1,net:1,decorations:[{...decorated.decorations[0],printCode:'FREE'}]},prices,rules,now);assert.equal(q.totalIncVat,228750);assert.ok(validateCartLine(catalog,{...blank,quantity:-1}));assert.ok(validateCartLine(catalog,{...decorated,decorations:[decorated.decorations[0],decorated.decorations[0]]}));assert.ok(validateCartLine(catalog,{...decorated,decorations:[{...decorated.decorations[0],width:999}]}));assert.ok(!JSON.stringify(q).includes('nettPrice'));});
test('import rejects empty and ambiguous structures before replacing an existing snapshot',()=>{assert.throws(()=>normalizePrices({},print));assert.throws(()=>normalizePrices(goods,{}));const duplicate=structuredClone(goods);const group=duplicate.priceInfo[0].models[0].model[0].items[0];group.item.push(group.item[0]);assert.throws(()=>normalizePrices(duplicate,print),/Dubleret/);});
test('import accepts PF current lowercase setup fields and full-colour labels',()=>{const current=structuredClone(print),setup=current.decoCharges[0].decoCharge[0].logoSizes[0].logoSize[0].amountColors[0].amountColor[0],charge=setup.amountSetupCharges[0].amountSetupCharge[0];setup.amountColorsId='Full color';charge.amountSetupChargeId=charge.AmountSetupChargeId;charge.setupCharge=charge.SetupCharge;delete charge.AmountSetupChargeId;delete charge.SetupCharge;const normalized=normalizePrices(goods,current),choice=normalized.prints[o.printCode].combinations[0];assert.equal(choice.colors,1);assert.equal(choice.setups,1);assert.equal(choice.setup,100);});
test('product cards expose the marked-up price at PF minimum quantity',()=>{const result=listPFProductPrices(catalog,prices,{goodsMarkup:70,printMarkup:70},now);assert.equal(result.available,true);assert.deepEqual(result.products[p.id],{fromExVat:17000,fromIncVat:21250,fromQuantity:25});assert.equal(result.skus[v.sku],true);assert.equal(result.skuMinimums[v.sku],1);assert.ok(!JSON.stringify(result).includes('nettPrice'));assert.equal(listPFProductPrices(catalog,null,rules,now).available,false);});
test('quantity tiers show the actual goods unit price and discount without exposing supplier prices',()=>{const result=listPFProductTiers(catalog,p.id,v.sku,prices,rules,now);assert.equal(result.minimumQuantity,1);assert.equal(result.smallOrderThreshold,25);assert.deepEqual(result.tiers,[{min:1,unitExVat:15000,unitIncVat:18750},{min:50,unitExVat:12000,unitIncVat:15000}]);assert.equal(result.tiers[0].unitExVat*25,quotePFLine(catalog,{...blank,quantity:25},prices,rules,now).goods);assert.equal(result.tiers[1].unitExVat*50,quotePFLine(catalog,{...blank,quantity:50},prices,rules,now).goods);assert.ok(!JSON.stringify(result).includes('nettPrice'));assert.equal(listPFProductTiers(catalog,p.id,v.sku,null,rules,now).available,false);});
test('headwear quantity discounts include its 25 percent goods uplift',()=>{const cap={...p,category:'Caps & hatte'},capCatalog={...catalog,products:[cap]},result=listPFProductTiers(capCatalog,p.id,v.sku,prices,rules,now);assert.equal(result.tiers[0].unitExVat,18750);assert.equal(result.tiers[1].unitExVat,15000);assert.equal(result.tiers[1].unitExVat*50,quotePFLine(capCatalog,{...blank,quantity:50},prices,rules,now).goods);});
test('caps and hats cost 25 percent more for goods in catalog and cart, without changing decoration',()=>{const cap={...p,shopCategory:'caps',category:'Caps & hatte'},hat={...cap,category:'Huer'},sunglasses={...cap,category:'Solbriller'};const withProduct=product=>({...catalog,products:[product]});const standardCard=listPFProductPrices(catalog,prices,rules,now).products[p.id];for(const product of [cap,hat]){const updated=withProduct(product),card=listPFProductPrices(updated,prices,rules,now).products[p.id];assert.deepEqual(card,{fromExVat:18750,fromIncVat:23438,fromQuantity:25});const standard=quotePFLine(catalog,decorated,prices,rules,now),increased=quotePFLine(updated,decorated,prices,rules,now);assert.equal(increased.goods,187500);assert.equal(increased.goods,Math.round(standard.goods*1.25));assert.equal(increased.print,standard.print);assert.equal(increased.setup,standard.setup);assert.equal(increased.totalIncVat,increased.net+increased.vat);}assert.equal(standardCard.fromExVat,15000);assert.equal(listPFProductPrices(withProduct(sunglasses),prices,rules,now).products[p.id].fromExVat,standardCard.fromExVat);});
test('new margin rules double standard goods and print while keeping headwear goods near its prior level',()=>{const marginRules={goodsMarkup:100,printMarkup:100,setupMarkup:50,headwearGoodsMarkup:112.5},cap={...p,category:'Caps & hatte'},capCatalog={...catalog,products:[cap]};const standard=quotePFLine(catalog,{...decorated,quantity:50},prices,marginRules,now),headwear=quotePFLine(capCatalog,{...decorated,quantity:50},prices,marginRules,now);assert.equal(standard.goods,800000);assert.equal(headwear.goods,850000);assert.equal(standard.print,80000);assert.equal(standard.setup,15000);assert.equal(headwear.print,standard.print);assert.equal(headwear.setup,standard.setup);});
test('Moleskine uses its market-aligned goods markup across cards, tiers and checkout',()=>{
 const notebook={...p,brandId:'moleskine',brand:'Moleskine'},notebookCatalog={...catalog,products:[notebook]},marketRules={...rules,goodsMarkup:100,moleskineGoodsMarkup:58};
 assert.deepEqual(listPFProductPrices(notebookCatalog,prices,marketRules,now).products[p.id],{fromExVat:15800,fromIncVat:19750,fromQuantity:25});
 assert.deepEqual(listPFProductTiers(notebookCatalog,p.id,v.sku,prices,marketRules,now).tiers,[{min:1,unitExVat:15800,unitIncVat:19750},{min:50,unitExVat:12640,unitIncVat:15800}]);
 assert.equal(quotePFLine(notebookCatalog,{...blank,quantity:25},prices,marketRules,now).goods,395000);
});
test('low-cost ballpoint pens use a market floor with clear quantity discounts while premium pens stay unchanged',()=>{
 const pen={...p,category:'Kuglepenne'},penCatalog={...catalog,products:[pen]},cheapPrices=structuredClone(prices),source=cheapPrices.products[v.sku];
 source.minimumDecoration=500;source.tiers=[{min:1,net:.5},{min:1000,net:.45},{min:5000,net:.4}];
 assert.deepEqual(listPFProductPrices(penCatalog,cheapPrices,rules,now).products[p.id],{fromExVat:320,fromIncVat:400,fromQuantity:500});
 assert.deepEqual(listPFProductTiers(penCatalog,p.id,v.sku,cheapPrices,rules,now).tiers,[
  {min:1,unitExVat:480,unitIncVat:600},
  {min:250,unitExVat:400,unitIncVat:500},
  {min:500,unitExVat:320,unitIncVat:400},
  {min:1000,unitExVat:288,unitIncVat:360},
  {min:2500,unitExVat:256,unitIncVat:320},
  {min:5000,unitExVat:232,unitIncVat:290},
  {min:10000,unitExVat:220,unitIncVat:275}
 ]);
 assert.equal(quotePFLine(penCatalog,{...blank,quantity:500},cheapPrices,rules,now).goods,160000);
 assert.equal(quotePFLine(penCatalog,{...blank,quantity:5000},cheapPrices,rules,now).goods,1160000);
 const premiumPrices=structuredClone(prices);premiumPrices.products[v.sku]={currency:'DKK',minimumDecoration:500,tiers:[{min:1,net:80}]};
 assert.equal(listPFProductPrices(penCatalog,premiumPrices,rules,now).products[p.id].fromExVat,12000);
});
test('storefront shows current priced products at their supplier minimum',()=>{const unpriced={...p,id:'pf-unpriced',variants:[{...v,sku:'NO-PRICE'}]},mixed={...p,id:'pf-mixed',variants:[v,{...v,sku:'NO-PRICE'}]},index={products:[p,unpriced,mixed]},result=listPFProductPrices(index,prices,rules,now);assert.deepEqual(shopProducts(index,result).map(row=>row.id),[p.id,mixed.id]);assert.equal(index.products.length,3);assert.equal(result.products[p.id].fromQuantity,25);assert.equal(isShopProduct(unpriced,result),false);assert.deepEqual(pricedVariants(mixed,result).map(row=>row.sku),[v.sku]);assert.deepEqual(shopProducts(index,{...result,available:false}),[]);const manual={...result,quoteOnlyIds:[unpriced.id]};assert.deepEqual(shopProducts(index,manual).map(row=>row.id),[p.id,mixed.id]);assert.equal(isQuoteOnlyProduct(unpriced,manual),false);assert.deepEqual(pricedVariants(unpriced,manual),[]);});
test('unpriced launches stay in the catalog but are not published',()=>{const upcoming={...p,id:'pf-new-green',brandId:'citizen-green',variants:[{...v,sku:'NEW-GREEN'}]},index={products:[upcoming]},current=listPFProductPrices(index,prices,rules,now),preview={...current,comingSoonIds:[upcoming.id]};assert.deepEqual(shopProducts(index,preview),[]);assert.equal(isComingSoonProduct(upcoming,preview),false);assert.equal(isQuoteOnlyProduct(upcoming,preview),false);assert.deepEqual(pricedVariants(upcoming,preview),[]);assert.equal(index.products.length,1);});
test('current PF promotional and customer-specific prices can be displayed and quoted',()=>{const current=structuredClone(prices);current.products[v.sku].temporary=true;assert.ok(listPFProductPrices(catalog,current,rules,now).products[p.id]);assert.equal(quotePFLine(catalog,blank,current,rules,now).goods,150000);});
test('print price matrix exposes marked-up unit, rounded setup and PF minimum quantity',()=>{const result=listPFPrintPrices(catalog,p.id,v.sku,10,prices,rules,now),row=result.options[o.id].rows[0];assert.equal(result.available,true);assert.equal(result.smallOrderThreshold,25);assert.deepEqual(row,{colors:1,unitExVat:2000,setupExVat:10000,smallOrderExVat:3000,areaCm2:0,minQuantity:1});assert.ok(!JSON.stringify(result).includes('nettPrice'));assert.equal(listPFPrintPrices(catalog,p.id,v.sku,10,null,rules,now).available,false);});
test('PF setup rounds up to the next 50 kr, while the small-order fee is passed through',()=>{for(const [supplierSetup,customerSetup] of [[220,250],[320,350],[250,250],[0,0]]){const current=structuredClone(prices);current.prints[o.printCode].combinations[0].setup=supplierSetup;const row=listPFPrintPrices(catalog,p.id,v.sku,10,current,rules,now).options[o.id].rows[0];assert.equal(row.setupExVat,customerSetup*100);assert.equal(row.smallOrderExVat,3000);assert.equal(quotePFLine(catalog,decorated,current,rules,now).setup,(customerSetup+30)*100);assert.equal(quotePFLine(catalog,{...decorated,quantity:50},current,rules,now).setup,customerSetup*100);}});
test('PF multicolour setup rows are total charges for the chosen colour count',()=>{const multiCatalog=structuredClone(catalog),multiOption=multiCatalog.products[0].variants[0].options[0];multiOption.maxColours='4';const multiPrices=structuredClone(prices),charge=multiPrices.prints[o.printCode];charge.dependence='Colors';charge.combinations=[1,2,3,4].map(colors=>({...charge.combinations[0],colors,setups:colors,setup:100*colors,tiers:[{min:1,net:10*colors}]}));const rows=listPFPrintPrices(multiCatalog,p.id,v.sku,10,multiPrices,rules,now).options[o.id].rows;assert.equal(rows.length,4);assert.equal(rows[2].setupExVat,30000);assert.equal(rows[2].smallOrderExVat,3000);const one=quotePFLine(multiCatalog,decorated,multiPrices,rules,now),three=quotePFLine(multiCatalog,{...decorated,decorations:[{...decorated.decorations[0],colors:3}]},multiPrices,rules,now);assert.equal(one.setup,13000);assert.equal(three.setup,33000);assert.equal(three.print,60000);assert.ok(three.totalIncVat>one.totalIncVat);});
test('each colour-priced placement offers only PF priced colour steps',()=>{const option={maxColours:'4'},pricing={dependence:'Colors',rows:[{colors:1,setupExVat:25000},{colors:3,setupExVat:65000},{colors:5,setupExVat:100000}]};assert.deepEqual(placementColourOptions(option,pricing).map(choice=>choice.colors),[1,3]);assert.equal(hasColourDependentSetup(pricing),true);});
test('fixed embroidery allows thread colours without multiplying its one setup',()=>{const embroideryCatalog=structuredClone(catalog),embroideryOption=embroideryCatalog.products[0].variants[0].options[0];embroideryOption.maxColours='12';const embroideryPrices=structuredClone(prices);embroideryPrices.prints[o.printCode].combinations[0].setup=320;const matrix=listPFPrintPrices(embroideryCatalog,p.id,v.sku,10,embroideryPrices,rules,now).options[o.id];assert.deepEqual(placementColourOptions(embroideryOption,matrix).map(choice=>choice.colors),Array.from({length:12},(_,index)=>index+1));assert.equal(hasColourDependentSetup(matrix),false);const three=quotePFLine(embroideryCatalog,{...decorated,decorations:[{...decorated.decorations[0],colors:3}]},embroideryPrices,rules,now);assert.equal(three.setup,38000);assert.equal(three.print,20000);});
test('different colour counts on two placements produce two independent setup charges',()=>{const pairCatalog=structuredClone(catalog),options=pairCatalog.products[0].variants[0].options,second=options.find(option=>option.impMethod==='Serigrafi'&&option.id!==o.id);options.find(option=>option.id===o.id).maxColours='3';second.maxColours='3';const pairPrices=structuredClone(prices),charge=pairPrices.prints[o.printCode];charge.dependence='Colors';charge.combinations=[1,2,3].map(colors=>({...charge.combinations[0],colors,setups:colors,setup:100*colors,tiers:[{min:1,net:10*colors}]}));const secondSize=designGroupSize([],'TEST',textPlacement,second),line={...decorated,decorations:[decorated.decorations[0],{...decorated.decorations[0],optionId:second.id,width:Math.round(secondSize.widthMm*10)/10,height:Math.round(secondSize.heightMm*10)/10,colors:3}]};const quote=quotePFLine(pairCatalog,line,pairPrices,rules,now);assert.equal(quote.setup,46000);assert.equal(quote.print,80000);});
test('stock feed exposes only catalogue variants and rejects stale or invalid snapshots',()=>{const feed={stockFeed:{creationDateTime:'2026-09-17T13:00:00Z',models:{model:[{items:{item:[{itemCode:v.sku,stockDirect:42,stockNextPo:100,stockDateNextPo:'2026-09-25',StockFuture:200},{itemCode:'PRIVATE-SKU',stockDirect:9}]}}]}}},stock=normalizeStock(feed),result=listPFStock(catalog,stock,now);assert.equal(result.available,true);assert.deepEqual(result.items[v.sku],{available:42,incoming:100,incomingDate:'2026-09-25'});assert.equal(result.items['PRIVATE-SKU'],undefined);assert.equal(listPFStock(catalog,{...stock,updatedAt:'2020-01-01'},now).available,false);assert.throws(()=>normalizeStock({}));});
test('negative direct stock from PF is exposed as zero',()=>{const feed={stockFeed:{creationDateTime:'2026-09-17T13:00:00Z',models:{model:[{items:{item:[{itemCode:v.sku,stockDirect:-3}]}}]}}};assert.equal(normalizeStock(feed).items[v.sku].available,0);});

test('live estimate includes goods, print and setup before upload without enabling checkout',()=>{
 const line={productId:p.id,sku:v.sku,quantity:25,decorations:[{optionId:o.id,colors:1}]};
 const q=estimatePFLine(catalog,line,prices,rules,now);
 assert.equal(q.goods,375000);assert.equal(q.print,50000);assert.equal(q.setup,10000);assert.equal(q.totalIncVat,543750);assert.equal(q.estimate,true);
 assert.ok(validateCartLine(catalog,line));
 const larger=estimatePFLine(catalog,{...line,quantity:50},prices,rules,now);
 assert.ok(larger.totalIncVat/50<q.totalIncVat/25);
 assert.equal(estimatePFLine(catalog,{...line,decorations:[]},prices,rules,now).print,0);
 assert.equal(estimatePFLine(catalog,{...line,decorations:[{optionId:'fake',colors:1}]},prices,rules,now).totalIncVat,null);
 assert.equal(estimatePFLine(catalog,{...line,decorations:[{optionId:o.id,colors:0}]},prices,rules,now).totalIncVat,null);
 assert.equal(estimatePFLine(catalog,line,null,rules,now).totalIncVat,null);
});

test('additional colour setups get 10 percent off their share with a PF cost floor in matrix, estimate and cart',()=>{
 const multiCatalog=structuredClone(catalog);
 multiCatalog.products[0].variants[0].options[0].maxColours='4';
 const multiPrices=structuredClone(prices),charge=multiPrices.prints[o.printCode];
 charge.dependence='Colors';
 charge.combinations=[1,2,3,4].map(colors=>({...charge.combinations[0],colors,setups:colors,setup:100*colors,tiers:[{min:1,net:10*colors}]}));
 for(const markup of [50,0]){
  const pricingRules={...rules,setupMarkup:markup};
  const rows=listPFPrintPrices(multiCatalog,p.id,v.sku,10,multiPrices,pricingRules,now).options[o.id].rows;
  assert.deepEqual(rows.map(row=>row.setupExVat),markup===50?[15000,28500,42000,55500]:[10000,20000,30000,40000]);
  for(const colors of [1,2,3,4]){
   const line={...decorated,decorations:[{...decorated.decorations[0],colors}]};
   const quote=quotePFLine(multiCatalog,line,multiPrices,pricingRules,now);
   assert.equal(quote.setup,rows[colors-1].setupExVat+3000);
   assert.equal(estimatePFLine(multiCatalog,line,multiPrices,pricingRules,now).setup,quote.setup);
   assert.equal(quotePFCart(multiCatalog,[line],multiPrices,pricingRules,now).setup,quote.setup);
   assert.ok(rows[colors-1].setupExVat>=10000*colors);
  }
 }
});

test('cart detail amounts reconcile with totals without exposing supplier prices',()=>{
 const q=quotePFLine(catalog,decorated,prices,rules,now);
 assert.equal(q.goods,q.goodsUnit*decorated.quantity);
 assert.equal(q.setup,q.setupBase+q.smallOrder);
 assert.equal(q.print,q.decorationPrices.reduce((n,d)=>n+d.print,0));
 assert.equal(q.setupBase,q.decorationPrices.reduce((n,d)=>n+d.setup,0));
 assert.equal(q.smallOrder,q.decorationPrices.reduce((n,d)=>n+d.smallOrder,0));
 assert.equal(q.net,q.goods+q.print+q.setup);
 assert.equal(q.totalIncVat,q.net+q.vat);
 assert.deepEqual(Object.keys(q.decorationPrices[0]).sort(),['optionId','method','position','colors','printUnit','print','setup','smallOrder'].sort());
 const cart=quotePFCart(catalog,[decorated,blank],prices,rules,now);
 assert.equal(cart.setupBase,q.setupBase);
 assert.equal(cart.smallOrder,q.smallOrder);
 const unknown=quotePFLine(catalog,decorated,null,rules,now);
 assert.equal(unknown.totalIncVat,null);
});

test('manual SKU prices agree across cards, tiers, estimates and checkout, without changing procurement',()=>{
 const custom={...rules,salePrices:{[v.sku]:[{min:1,unitExVat:12345},{min:40,unitExVat:10000}]}};
 assert.equal(listPFProductPrices(catalog,prices,custom,now).products[p.id].fromExVat,12345);
 assert.deepEqual(listPFProductTiers(catalog,p.id,v.sku,prices,custom,now).tiers,[{min:1,unitExVat:12345,unitIncVat:15431},{min:40,unitExVat:10000,unitIncVat:12500}]);
 for(const quantity of [1,39,40,50,100]){const line={...blank,quantity},unit=quantity<40?12345:10000;assert.equal(quotePFLine(catalog,line,prices,custom,now).goodsUnit,unit);assert.equal(estimatePFLine(catalog,line,prices,custom,now).goodsUnit,unit);assert.equal(quotePFCart(catalog,[line],prices,custom,now).goods,unit*quantity);}
 const before=quotePFLine(catalog,decorated,prices,rules,now),after=quotePFLine(catalog,decorated,prices,custom,now);assert.equal(after.print,before.print);assert.equal(after.setup,before.setup);
 assert.equal(supplierPFOrderAmounts(catalog,[blank],prices,now).unitPrices[0],100);
 assert.equal(listPFProductPrices(catalog,prices,rules,now).products[p.id].fromExVat,15000);
 assert.ok(!JSON.stringify(listPFProductPrices(catalog,prices,custom,now)).includes('salePrices'));
});

test('Thule retail pricing matches Achiever target across tiers, cards and checkout',()=>{
 const product={...p,brandId:'thule'},cat={...catalog,products:[product]},source=structuredClone(prices),pricing={...rules,goodsMarkup:100,thuleGoodsMarkup:70};
 source.products[v.sku].tiers=[{min:1,net:325},{min:25,net:315},{min:50,net:305}];
 const tiers=listPFProductTiers(cat,p.id,v.sku,source,pricing,now).tiers;
 assert.equal(tiers[0].unitIncVat,69000);
 assert.equal(tiers[1].unitIncVat,66900);
 for(const row of tiers){const q=quotePFLine(cat,{...blank,quantity:row.min},source,pricing,now);assert.equal(q.goods,row.unitExVat*row.min);assert.ok(row.unitExVat>=source.products[v.sku].tiers.find(t=>t.min===row.min).net*100);}
 assert.equal(listPFProductPrices(cat,source,pricing,now).products[p.id].fromIncVat,66900);
});
test('goods never sell below updated supplier cost, including manual overrides and rounding',()=>{
 const cat={...catalog,products:[{...p,brandId:'thule'}]},pricing={...rules,thuleGoodsMarkup:-20,salePrices:{[v.sku]:[{min:1,unitExVat:1}]}};
 for(const quantity of [1,50]){const net=quantity<50?10000:8000;assert.equal(quotePFLine(cat,{...blank,quantity},prices,pricing,now).goods,net*quantity);}
 const updated=structuredClone(prices);updated.products[v.sku].tiers=[{min:1,net:120.01}];
 for(const salePrices of [pricing.salePrices,{}]){const r={...pricing,salePrices,thuleGoodsMarkup:0};assert.equal(listPFProductTiers(cat,p.id,v.sku,updated,r,now).tiers[0].unitExVat,12001);assert.equal(quotePFLine(cat,{...blank,quantity:1},updated,r,now).goods,12001);}
});

test('agreed branded prices apply to every colour, preserve volume discounts and agree with checkout',async()=>{
 for(const [id,cost,retail]of [['pf-100834',240,449],['pf-100990',180,349],['pf-100751',210,399],['pf-124399',310,599],['pf-124525',140,299]]){
  const product=structuredClone(await loadPFProduct(id)),cat={...catalog,products:[product]},source={...prices,products:{}},pricing={...rules,goodsMarkup:100};
  // Isolate goods calculations from the supplier's mandatory-decoration policy.
  for(const variant of product.variants)variant.decorationMandatory=false;
  for(const variant of product.variants)source.products[variant.sku]={currency:'DKK',minimumDecoration:1,tiers:[{min:1,net:cost},{min:50,net:cost*.9}]};
  assert.equal(listPFProductPrices(cat,source,pricing,now).products[id].fromIncVat,retail*100);
  for(const variant of product.variants){
   const rows=listPFProductTiers(cat,id,variant.sku,source,pricing,now).tiers;
   assert.equal(rows[0].unitIncVat,retail*100);
   assert.equal(rows[1].unitExVat,Math.round(retail*80*.9));
   for(const row of rows){
    const line={productId:id,sku:variant.sku,quantity:row.min,decorations:[]};
    assert.equal(quotePFLine(cat,line,source,pricing,now).goodsUnit,row.unitExVat);
    assert.equal(estimatePFLine(cat,line,source,pricing,now).goodsUnit,row.unitExVat);
    assert.equal(quotePFCart(cat,[line],source,pricing,now).goods,row.unitExVat*row.min);
   }
   const manual={...pricing,salePrices:{[variant.sku]:[{min:1,unitExVat:1}]}};
   assert.equal(listPFProductTiers(cat,id,variant.sku,source,manual,now).tiers[0].unitExVat,cost*100);
  }
 }
});

test('EcoSeal retail uplift applies to every model and colour, preserving quantity discounts',async()=>{
 for(const id of ['pf-130103','pf-130105','pf-130106','pf-130136']){
  const product=await loadPFProduct(id),cat={...catalog,products:[product]},source={...prices,products:{}};
  for(const variant of product.variants)source.products[variant.sku]={currency:'DKK',minimumDecoration:100,tiers:[{min:1,net:1.25},{min:250,net:1}]};
  assert.equal(listPFProductPrices(cat,source,rules,now).products[id].fromIncVat,375);
  for(const variant of product.variants){
   const tiers=listPFProductTiers(cat,id,variant.sku,source,rules,now).tiers;
   assert.deepEqual(tiers,[{min:1,unitExVat:300,unitIncVat:375},{min:250,unitExVat:240,unitIncVat:300}]);
   for(const quantity of [100,250]){
    const line={productId:id,sku:variant.sku,quantity,decorations:[]},unit=quantity===100?300:240;
    assert.equal(quotePFLine(cat,line,source,rules,now).goodsUnit,unit);
    assert.equal(quotePFCart(cat,[line],source,rules,now).goods,unit*quantity);
   }
  }
 }
});

test('Sencha coaster costs 10 DKK including VAT on cards, tiers and in the cart',async()=>{
 const product=await loadPFProduct('pf-113415'),sku='11341506',cat={...catalog,products:[product]};
 const source={...prices,products:{[sku]:{currency:'DKK',minimumDecoration:25,tiers:[{min:1,net:1.15},{min:25,net:1.15},{min:50,net:1.15}]}}};
 assert.deepEqual(listPFProductPrices(cat,source,rules,now).products[product.id],{fromExVat:800,fromIncVat:1000,fromQuantity:25});
 assert.equal(listPFProductTiers(cat,product.id,sku,source,rules,now).tiers[0].unitIncVat,1000);
 for(const quantity of [1,25,50]){
  const line={productId:product.id,sku,quantity,decorations:[]};
  assert.equal(quotePFLine(cat,line,source,rules,now).goodsUnit,800);
  assert.equal(quotePFCart(cat,[line],source,rules,now).totalIncVat,quantity*1000);
 }
 const higherCost={...source,products:{[sku]:{...source.products[sku],tiers:[{min:1,net:9}]}}};
 assert.equal(listPFProductPrices(cat,higherCost,rules,now).products[product.id].fromIncVat,1125);
});
