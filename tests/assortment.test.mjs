import test from 'node:test';
import {isHiddenShopBrand} from '../dist/shop-brand-policy.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readAssortment,publicAssortment,isListed,setVisibility,adminProduct} from '../lib/assortment.mjs';
import {isPolandProduct} from '../lib/pf-shipping-origin.mjs';
import {loadCatalogIndex} from '../lib/pf-catalog-store.mjs';
test('initial assortment includes only confirmed Polish products; admin retains all products',async()=>{
 const catalog=await loadCatalogIndex(),state={overrides:{}},shop=publicAssortment(catalog,state);
 assert.equal(shop.products.length,catalog.products.filter(p=>isPolandProduct(p)&&!isHiddenShopBrand(p)).length);assert.ok(shop.products.every(isPolandProduct));assert.ok(shop.products.every(p=>!isHiddenShopBrand(p)));assert.ok(!shop.brands.some(b=>b.id==='roly'));assert.ok(catalog.products.length>2000);
 assert.ok(shop.brands.length>0);
 assert.equal(catalog.products.map(p=>adminProduct(p,state)).length,catalog.products.length);
});
test('visibility overrides survive rereads and supplier updates; new products default hidden',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'smerch-assortment-')),path=join(dir,'choices.json'),catalog={products:[{id:'pf-107384',shippingOrigin:{countries:['PL'],unknown:false}},{id:'pf-new',shippingOrigin:{countries:['PL'],unknown:false}}]};
 try{assert.equal(isListed('pf-new',await readAssortment(path)),false);
 await writeFile(path,JSON.stringify({version:2,overrides:{'pf-107384':false,'pf-new':true}}));assert.equal(isListed('pf-new',await readAssortment(path)),false);assert.equal(isListed('pf-107384',await readAssortment(path)),true);

 await Promise.all([setVisibility('pf-107384',false,catalog,{path}),setVisibility('pf-new',true,catalog,{path})]);
 const state=await readAssortment(path);assert.equal(isListed('pf-107384',state),false);assert.equal(isListed('pf-new',state),true);
 assert.equal(isListed('pf-future',state),false);
 await assert.rejects(setVisibility('unknown',true,catalog,{path}));await assert.rejects(setVisibility('pf-new','false',catalog,{path}));
 await setVisibility('pf-107384',true,catalog,{path});assert.equal(isListed('pf-107384',await readAssortment(path)),true);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Roly starts hidden but administrators can add and hide individual products',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'smerch-roly-')),path=join(dir,'choices.json');
 const product={id:'pf-roly-test',brand:'Roly',brandId:'roly',shippingOrigin:{countries:['PL'],unknown:false},variants:[{sku:'r',images:[],methods:[]}]};
 const catalog={products:[product],brands:[{id:'roly'}]};
 try{
  let state=await readAssortment(path);
  assert.equal(publicAssortment(catalog,state).products.length,0);
  assert.equal(adminProduct(product,state).eligibleForShop,true);
  await setVisibility(product.id,true,catalog,{path});state=await readAssortment(path);
  assert.equal(publicAssortment(catalog,state).products.length,1);
  assert.equal(publicAssortment(catalog,state).brands.length,1);
  assert.equal(adminProduct(product,state).visible,true);
  await setVisibility(product.id,false,catalog,{path});
  assert.equal(publicAssortment(catalog,await readAssortment(path)).products.length,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
