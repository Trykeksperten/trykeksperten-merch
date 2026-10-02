import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readAssortment,publicAssortment,isListed,setVisibility,adminProduct} from '../lib/assortment.mjs';
import {loadCatalogIndex} from '../lib/pf-catalog-store.mjs';
test('initial assortment preserves 100 products and all supplier data remains available',async()=>{
 const catalog=await loadCatalogIndex(),state={overrides:{}},shop=publicAssortment(catalog,state);
 assert.equal(shop.products.length,100);assert.ok(catalog.products.length>2000);
 for(const id of ['pf-107384','pf-120332','pf-100942'])assert.ok(shop.products.some(p=>p.id===id));
 assert.ok(shop.products.every(p=>['toj','tasker','flasker','kontor','papir'].includes(p.shopCategory)),JSON.stringify([...new Set(shop.products.map(p=>p.shopCategory))]));
 assert.ok(shop.brands.every(b=>shop.products.some(p=>p.brandId===b.id)));
 assert.equal(catalog.products.map(p=>adminProduct(p,state)).length,catalog.products.length);
});
test('visibility overrides survive rereads and supplier updates; new products default hidden',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'smerch-assortment-')),path=join(dir,'choices.json'),catalog={products:[{id:'pf-107384'},{id:'pf-new'}]};
 try{assert.equal(isListed('pf-new',await readAssortment(path)),false);
 await Promise.all([setVisibility('pf-107384',false,catalog,{path}),setVisibility('pf-new',true,catalog,{path})]);
 const state=await readAssortment(path);assert.equal(isListed('pf-107384',state),false);assert.equal(isListed('pf-new',state),true);
 assert.equal(isListed('pf-future',state),false);
 await assert.rejects(setVisibility('unknown',true,catalog,{path}));await assert.rejects(setVisibility('pf-new','false',catalog,{path}));
 await setVisibility('pf-107384',true,catalog,{path});assert.equal(isListed('pf-107384',await readAssortment(path)),true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
