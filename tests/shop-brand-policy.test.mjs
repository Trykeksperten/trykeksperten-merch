import test from 'node:test';
import assert from 'node:assert/strict';
import {publicProductBrand} from '../dist/shop-brand-policy.mjs';
import {loadCatalogIndex,loadPFProduct} from '../lib/pf-catalog-store.mjs';
import {publicAssortment} from '../lib/assortment.mjs';
import {seoPage} from '../dist/seo-pages.mjs';

test('internal merchandising labels disappear from catalogue, detail and SEO without losing the products',async()=>{
 const index=await loadCatalogIndex(),product=index.products.find(p=>p.brandId==='trykeksperten-select');
 assert.ok(product);
 assert.equal(product.brand,'');
 const detail=await loadPFProduct(product.id);
 assert.equal(detail.brand,'');
 assert.equal(detail.id,product.id);
 const catalog=publicAssortment(index,{overrides:{[product.id]:true}});
 assert.ok(catalog.products.some(p=>p.id===product.id));
 assert.ok(catalog.brands.every(b=>!/trykeksperten/i.test(b.name)));
 const page=seoPage(`/design/${product.id}`,'',catalog,detail);
 assert.ok(page);
 assert.ok(!/trykeksperten/i.test(JSON.stringify(page.schema)));
 assert.ok(!Object.hasOwn(page.schema.find(s=>s['@type']==='Product'),'brand'));
 const normal={id:'pf-test',brandId:'stanley',brand:'Stanley',name:'Bottle'};
 assert.equal(publicProductBrand(normal),normal);
});
