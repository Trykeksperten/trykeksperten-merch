import test from 'node:test';
import assert from 'node:assert/strict';
import {shippingOrigin,shippingCountryLabel,isPolandProduct} from '../lib/pf-shipping-origin.mjs';
import {loadCatalogIndex,iteratePFProducts} from '../lib/pf-catalog-store.mjs';
import {publicAssortment,adminProduct,setVisibility} from '../lib/assortment.mjs';
const product=(...codes)=>({id:'pf-test',brandId:'test',variants:codes.map(code=>({options:code===null?[]:[{productionLocation:code}]}))});
test('only unambiguous Polish options qualify; unknown or mixed countries fail closed',()=>{
 assert.equal(isPolandProduct(product('PL','PL')),true);
 for(const p of [product('PL','UK'),product('PL',''),product(null),product('FR'),product()])assert.equal(isPolandProduct(p),false);
 assert.equal(shippingCountryLabel(product('GB')),'Storbritannien');
 assert.equal(shippingCountryLabel(product('FR')),'Frankrig');
 assert.equal(shippingCountryLabel(product('ES')),'Spanien');
 assert.equal(shippingCountryLabel(product('')),'Land ikke oplyst');
});
test('index origin metadata matches full product routing data',async()=>{
 const index=await loadCatalogIndex(),summaries=new Map(index.products.map(p=>[p.id,p]));
 for await(const p of iteratePFProducts())assert.deepEqual(shippingOrigin(summaries.get(p.id)),shippingOrigin(p),p.id);
});
test('other countries cannot be exposed via an old visibility override or admin toggle',async()=>{
 const foreign=product('UK'),catalog={products:[foreign],brands:[{id:'test'}]},state={overrides:{'pf-test':true}};
 assert.equal(publicAssortment(catalog,state).products.length,0);
 const admin=adminProduct(foreign,state);assert.equal(admin.visible,false);assert.equal(admin.eligibleForShop,false);assert.equal(admin.shippingCountry,'Storbritannien');
 await assert.rejects(setVisibility(foreign.id,true,catalog),/Polen/);
});
