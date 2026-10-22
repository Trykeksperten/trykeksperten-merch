import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesProductSearch,searchSuggestions} from '../dist/product-search.mjs';
const product={id:'pf-100753',name:'Ocean Bottle Big 1 liter',brand:'Ocean Bottle',modelCode:'100753',variants:[{sku:'10075390'}]};
test('search matches all words regardless of order, case and whitespace',()=>{
 for(const q of ['ocean big','BIG ocean',' big  bottle ocean ','100753 ocean'])assert.ok(matchesProductSearch(product,q));
 assert.equal(matchesProductSearch(product,'ocean stanley'),false);
});
test('suggestions exclude unavailable products and require two characters',()=>{
 const catalog={products:[product,{...product,id:'hidden'}]},prices={available:true,products:{[product.id]:{}},skus:{10075390:true}};
 assert.deepEqual(searchSuggestions(catalog,prices,'big ocean'),[product]);
 assert.deepEqual(searchSuggestions(catalog,prices,'o'),[]);
 assert.deepEqual(searchSuggestions(catalog,{available:false},'big ocean'),[]);
});
