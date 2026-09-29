import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {translate,setLanguage,installProductTranslations} from '../dist/i18n-core.mjs';
import {filterPFProducts} from '../dist/pf-filters.mjs';

test('English catalogue covers every product name and preserves Danish originals',async()=>{
 const translations=JSON.parse(await readFile(new URL('../dist/pf-english.json',import.meta.url)));
 const catalog=JSON.parse(await readFile(new URL('../data/pf-catalog-index.json',import.meta.url)));
 installProductTranslations(translations);
 setLanguage('en');
 for(const product of catalog.products){
  assert.ok(translations[product.name.replace(/\s+/g,' ').trim()],`Missing English name: ${product.id}`);
  assert.equal(translate(product.name,'da'),product.name);
 }
 assert.equal(translate('Tilføj til kurv'),'Add to cart');
 assert.equal(translate('1 farve · opstart 350,00 kr.'),'1 colour · setup 350,00 kr.');
 assert.equal(translate('Fra 1 stk.'),'From 1 item');
 assert.equal(translate('Fra 11 stk.'),'From 11 items');
 assert.equal(translate('1+ stk.'),'1+ items');
 assert.equal(translate('Trykeksperten ApS'),'Trykeksperten ApS');
 const p=catalog.products.find(p=>p.id==='pf-100942');
 const prices={available:true,products:{[p.id]:{fromIncVat:37500}},skus:Object.fromEntries(p.variants.map(v=>[v.sku,true]))};
 assert.equal(filterPFProducts([p],new URLSearchParams('q=water bottle'),prices,()=> 'recommended').length,1);
 setLanguage('da');
 assert.equal(translate('Tilføj til kurv'),'Tilføj til kurv');
});
