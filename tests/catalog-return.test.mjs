import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogReturn,productDetailURL} from '../dist/catalog-return.mjs';
const product={id:'pf-107384',shopCategory:'kontor'};
test('product links retain category, subcategory, filters, sorting and page after reload',()=>{
 const query=new URLSearchParams({kategori:'kontor',underkategori:'Kuglepenne',brand:'unbranded',q:'blå',sortering:'price-asc',side:'3'});
 const target=new URL(productDetailURL(product.id,query),'https://smerch.dk');
 const back=catalogReturn(product,target.search);
 assert.equal(back.href,'/produkter?'+query);assert.equal(back.label,'Kuglepenne');
});
test('unfiltered catalogue returns to all products and direct entries to the product group',()=>{
 const target=new URL(productDetailURL(product.id),'https://smerch.dk');
 assert.deepEqual(catalogReturn(product,target.search),{href:'/produkter',label:'Alle produkter'});
 assert.deepEqual(catalogReturn(product),{href:'/produkter?kategori=kontor',label:'Kuglepenne og skriveartikler'});
});
test('return links cannot send customers to another website or an unrelated route',()=>{
 for(const from of ['https://example.com','//example.com','/betaling','/produkter/../betaling']){
  assert.equal(catalogReturn(product,new URLSearchParams({from})).href,'/produkter?kategori=kontor');
 }
});
