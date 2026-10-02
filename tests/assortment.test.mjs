import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readAssortment,publicAssortment,isListed,setVisibility,adminProduct} from '../lib/assortment.mjs';
import {loadCatalogIndex} from '../lib/pf-catalog-store.mjs';
test('initial assortment includes all current supplier products',async()=>{
 const catalog=await loadCatalogIndex(),state={overrides:{}},shop=publicAssortment(catalog,state);
 assert.equal(shop.products.length,catalog.products.length);assert.ok(catalog.products.length>2000);
 assert.ok(shop.brands.length>0);
 assert.equal(catalog.products.map(p=>adminProduct(p,state)).length,catalog.products.length);
});
test('visibility overrides survive rereads and supplier updates; new products default hidden',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'smerch-assortment-')),path=join(dir,'choices.json'),catalog={products:[{id:'pf-107384'},{id:'pf-new'}]};
 try{assert.equal(isListed('pf-new',await readAssortment(path)),false);
 await writeFile(path,JSON.stringify({version:2,overrides:{'pf-107384':false,'pf-new':true}}));assert.equal(isListed('pf-new',await readAssortment(path)),false);assert.equal(isListed('pf-107384',await readAssortment(path)),true);

 await Promise.all([setVisibility('pf-107384',false,catalog,{path}),setVisibility('pf-new',true,catalog,{path})]);
 const state=await readAssortment(path);assert.equal(isListed('pf-107384',state),false);assert.equal(isListed('pf-new',state),true);
 assert.equal(isListed('pf-future',state),false);
 await assert.rejects(setVisibility('unknown',true,catalog,{path}));await assert.rejects(setVisibility('pf-new','false',catalog,{path}));
 await setVisibility('pf-107384',true,catalog,{path});assert.equal(isListed('pf-107384',await readAssortment(path)),true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
