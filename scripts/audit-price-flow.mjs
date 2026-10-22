// Read-only audit: no checkout persistence, payment calls, mail, or price writes.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadCatalogIndex,loadPFProduct,pfCatalogShard} from '../lib/pf-catalog-store.mjs';
import {readAssortment,isVisibleProduct} from '../lib/assortment.mjs';
import {loadPricing,loadStock,listPFProductTiers,estimatePFLine,quotePFCart} from '../lib/pf-pricing.mjs';
import {checkoutConfiguration,prepareCheckout} from '../lib/checkout.mjs';
import {customerSummary,brandedConfirmation} from '../lib/order-confirmation-view.mjs';
import {freightEstimate} from '../dist/purchase-flow.mjs';
import {designGroupSize} from '../dist/design-layers.mjs';
const {prices,rules}=await loadPricing(),stock=await loadStock(),state=await readAssortment(),index=await loadCatalogIndex();
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),before=digest(rules);
const report={at:new Date().toISOString(),products:0,variants:0,tiers:0,estimates:0,checkouts:0,decorated:0,manualSkus:Object.keys(rules.salePrices).length,failures:[],blocked:{},blockedCases:[],examples:[]};
const special=new Set(['pf-100834','pf-100990','pf-100751','pf-124399','pf-124525']);
const shipping={name:'Priskontrol',email:'audit@example.invalid',phone:'12345678',street:'Testvej 1',postalCode:'2300',city:'København S',country:'DK'};
function block(reason,context={}){report.blocked[reason]=(report.blocked[reason]||0)+1;report.blockedCases.push({reason,...context});}
function checkout(catalog,line,quote,label){
 let order;try{order=prepareCheckout({lines:[line],shipping},{catalog,prices,rules,stock});}catch(e){block(e.message,{productId:line.productId,sku:line.sku,decorations:line.decorations});return;}
 assert.deepEqual(freightEstimate({...order.fulfillment,ready:true},checkoutConfiguration(process.env)),{exVat:order.freightExVat,incVat:order.freightIncVat});
 assert.equal(order.quote.totalIncVat,quote.totalIncVat);assert.equal(order.totalIncVat,quote.totalIncVat+order.freightIncVat);assert.equal(order.freightIncVat,order.freightExVat+Math.round(order.freightExVat*.25));
 const summary=customerSummary(order);assert.equal(summary.total,order.totalIncVat);assert.equal(summary.lines[0].total,quote.totalIncVat);assert.equal(summary.freight,order.freightIncVat);assert.equal(summary.vat,quote.vat+order.freightIncVat-order.freightExVat);
 const html=brandedConfirmation({summary,locale:'da',nextSteps:'Test'});assert.ok(html.includes((order.totalIncVat/100).toLocaleString('da-DK',{style:'currency',currency:'DKK'})));
 report.checkouts++;if(line.decorations.length)report.decorated++;
 if(special.has(line.productId))report.examples.push({id:line.productId,sku:line.sku,label,quantity:line.quantity,goodsUnit:quote.lines[0].goodsUnit,productsInc:quote.totalIncVat,freightInc:order.freightIncVat,totalInc:order.totalIncVat});
}
for(const p of index.products.filter(p=>isVisibleProduct(p,state)).sort((a,b)=>pfCatalogShard(a.id).localeCompare(pfCatalogShard(b.id)))){
 const product=await loadPFProduct(p.id),catalog={products:[product]};report.products++;
 for(const v of product.variants.filter(v=>!v.discontinued)){
  const listing=listPFProductTiers(catalog,p.id,v.sku,prices,rules);if(!listing.available){block(listing.message,{productId:p.id,sku:v.sku});continue;}report.variants++;
  for(const t of listing.tiers){
   const line={productId:p.id,sku:v.sku,quantity:t.min,decorations:[]};const estimate=estimatePFLine(catalog,line,prices,rules);report.tiers++;
   try{assert.equal(estimate.goodsUnit,t.unitExVat);assert.equal(estimate.goods,t.unitExVat*t.min);assert.equal(estimate.totalIncVat,estimate.net+Math.round(estimate.net*.25));report.estimates++;}catch(e){report.failures.push({sku:v.sku,quantity:t.min,stage:'listing-estimate',error:e.message});}
  }
 }
 const v=product.variants.find(v=>!v.discontinued&&prices.products[v.sku]&&stock.items[v.sku]?.available>=10);if(!v)continue;
 const tiers=listPFProductTiers(catalog,p.id,v.sku,prices,rules);if(!tiers.available)continue;
 const quantity=Math.max(10,tiers.minimumQuantity),base={productId:p.id,sku:v.sku,quantity,decorations:[]};
 for(const line of [base,...(v.options||[]).filter(o=>o.productionLocation==='PL').slice(0,2).map(o=>{const textPlacement={x:.5,y:.5,scale:.24},size=designGroupSize([],'TEST',textPlacement,o);return {...base,decorations:[{optionId:o.id,width:Math.round(size.widthMm*10)/10,height:Math.round(size.heightMm*10)/10,colors:1,text:'TEST',textPlacement}]};})]){
  const quote=quotePFCart(catalog,[line],prices,rules);if(quote.totalIncVat===null){block(quote.message||quote.lines[0]?.error||'Quote unavailable',{productId:p.id,sku:v.sku,decorations:line.decorations});continue;}
  try{const estimate=estimatePFLine(catalog,line,prices,rules);assert.equal(estimate.totalIncVat,quote.totalIncVat);checkout(catalog,line,quote,line.decorations.length?'med dekoration':'uden logo');}catch(e){report.failures.push({sku:v.sku,stage:'checkout-confirmation',error:e.message});}
 }
}
report.priceRulesUnchanged=before===digest((await loadPricing()).rules);
console.log(JSON.stringify(report,null,2));if(report.failures.length||!report.priceRulesUnchanged)process.exitCode=1;
