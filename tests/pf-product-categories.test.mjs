import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyShopProduct} from '../lib/pf-product-categories.mjs';
import {loadCatalogIndex,loadPFProduct} from '../lib/pf-catalog-store.mjs';
import {groupLeaves,productGroups} from '../dist/product-groups.mjs';

test('exhibition supplies share Messe and preserve their supplier category across imports',()=>{
 for(const category of ['Sticky notes','Dokument mapper','Lanyard','Badgeholdere','Konferencetasker']){
  const original={category,name:'Produkt',shopCategory:'papir',id:'test'};
  const result=classifyShopProduct(original);
  assert.equal(result.category,'Messe');
  assert.equal(result.shopCategory,'giveaways');
  assert.equal(result.supplierCategory,category);
  assert.deepEqual(classifyShopProduct(result),result);
  assert.equal(original.category,category);
 }
 assert.equal(classifyShopProduct({name:'El recycled PET festival armbånd',category:'Armbånd'}).category,'Messe');
 for(const name of ['Arich smartphone armbånd','RFX badgeformet reflekterende hanger','Almindelig kuglepen']){
  const product={name,category:'Andet'};assert.equal(classifyShopProduct(product),product);
 }
});

test('Messe appears in navigation and product details agree with catalogue summaries',async()=>{
 const catalog=await loadCatalogIndex(),products=catalog.products.filter(p=>p.category==='Messe');
 assert.ok(products.length>80);
 assert.equal(groupLeaves(productGroups.find(g=>g.id==='giveaways'),catalog.products).find(c=>c.name==='Messe').count,products.length);
 for(const summary of products){
  const detail=await loadPFProduct(summary.id);
  assert.equal(detail.category,'Messe',summary.id);
  assert.equal(detail.shopCategory,summary.shopCategory,summary.id);
 }
});
