import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyShopProduct} from '../lib/pf-product-categories.mjs';
import {loadCatalogIndex,loadPFProduct} from '../lib/pf-catalog-store.mjs';
import {groupLeaves,productGroups} from '../dist/product-groups.mjs';

test('exhibition supplies share Messe and preserve their supplier category across imports',()=>{
 for(const category of ['Sticky notes','Dokument mapper','Lanyard','Badgeholdere','Konferencetasker']){
  const original={category,name:'Produkt',shopCategory:'papir',id:'test'};
  const result=classifyShopProduct(original);
  assert.equal(result.category,category);
  assert.equal(result.group,'Messe');
  assert.equal(result.shopCategory,'giveaways');
  assert.equal(result.supplierCategory,category);
  assert.deepEqual(classifyShopProduct(result),result);
  assert.equal(original.category,category);
 }
 assert.equal(classifyShopProduct({name:'El recycled PET festival armbånd',category:'Armbånd'}).group,'Messe');
 for(const name of ['Arich smartphone armbånd','RFX badgeformet reflekterende hanger','Almindelig kuglepen']){
  const product={name,category:'Andet'};assert.equal(classifyShopProduct(product),product);
 }
});

test('Messe appears in navigation and product details agree with catalogue summaries',async()=>{
 const catalog=await loadCatalogIndex(),products=catalog.products.filter(p=>p.group==='Messe');
 assert.ok(products.length>80);
 const leaves=groupLeaves(productGroups.find(g=>g.id==='giveaways'),catalog.products);
 assert.ok(!leaves.some(c=>c.name==='Messe'));
 for(const category of ['Sticky notes','Dokument mapper','Lanyard','Badgeholdere','Konferencetasker','Nøgleringe']) assert.ok(leaves.some(c=>c.name===category),category);
 assert.equal(leaves.reduce((total,c)=>total+c.count,0),products.length);
 for(const summary of products){
  const detail=await loadPFProduct(summary.id);
  assert.equal(detail.category,summary.category,summary.id);
  assert.equal(detail.group,'Messe',summary.id);
  assert.equal(detail.shopCategory,summary.shopCategory,summary.id);
 }
});

test('former Messe subcategory migrates back to the original supplier subcategory',()=>{
 const result=classifyShopProduct({name:'Sticky-Mate',category:'Messe',supplierCategory:'Sticky notes',shopCategory:'giveaways',group:'Giveaways'});
 assert.equal(result.category,'Sticky notes');
 assert.equal(result.group,'Messe');
 const keyring=classifyShopProduct({name:'Nøglering',category:'Nøgleringe',shopCategory:'giveaways',group:'Giveaways'});
 assert.equal(keyring.group,'Messe');
 assert.equal(keyring.category,'Nøgleringe');
});
