import test from 'node:test';
import assert from 'node:assert/strict';
import {cardPrice,cardPriceHTML} from '../dist/product-editorial.mjs';
import {setCustomerType} from '../dist/customer-pricing.mjs';
import {listPFProductPrices,listPFProductTiers,quotePFLine} from '../lib/pf-pricing.mjs';
import {loadPFProduct} from '../lib/pf-catalog-store.mjs';
const p=await loadPFProduct('pf-R6561'),catalog={products:[p]},now=Date.now();
const prices={productDate:new Date(now).toISOString(),products:Object.fromEntries(p.variants.map(v=>[v.sku,{currency:'DKK',tiers:[{min:1,net:v.color==='Hvid'?42:45},{min:1000,net:44}]}]))};
const rules={goodsMarkup:100,printMarkup:100};
const summary=listPFProductPrices(catalog,prices,rules,now);
test('pictured sand colour uses 112.50 while white uses 105, consistently with quote and tiers',()=>{
 for(const variant of p.variants){
  const card=cardPrice(p,summary,variant.images[0]),tiers=listPFProductTiers(catalog,p.id,variant.sku,prices,rules,now);
  const quote=quotePFLine(catalog,{productId:p.id,sku:variant.sku,quantity:1,decorations:[]},prices,rules,now);
  assert.equal(summary.variantPrices[variant.sku].fromIncVat,quote.totalIncVat);
  assert.equal(card.fromIncVat,tiers.tiers[0].unitIncVat);
  for(const tier of tiers.tiers){const q=quotePFLine(catalog,{productId:p.id,sku:variant.sku,quantity:tier.min,decorations:[]},prices,rules,now);assert.equal(q.goodsUnit,tier.unitExVat);}
 }
 const sand=p.variants.find(v=>v.color==='Sandfarvet'),white=p.variants.find(v=>v.color==='Hvid');
 assert.equal(cardPrice(p,summary,sand.images[0]).fromIncVat,11250);
 assert.equal(cardPrice(p,summary,white.images[0]).fromIncVat,10500);
});
test('VAT display uses exact net, and size variations are explicit',()=>{
 const price={fromExVat:9000,fromIncVat:11250,fromQuantity:1,varies:false};
 setCustomerType('consumer');assert.match(cardPriceHTML(price),/112,50/);assert.doesNotMatch(cardPriceHTML(price),/Fra/);
 setCustomerType('business');assert.match(cardPriceHTML(price),/90,00/);assert.match(cardPriceHTML({...price,varies:true}),/afhænger af størrelse/);setCustomerType('consumer');
});
test('missing colour price never falls back to another colour',()=>{assert.equal(cardPrice(p,{...summary,variantPrices:{}},p.variants[0].images[0]),null);});
