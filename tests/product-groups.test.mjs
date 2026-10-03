import test from 'node:test';
import assert from 'node:assert/strict';
import {productGroups,groupSections,productGroupURL} from '../dist/product-groups.mjs';
import {loadCatalogIndex,iteratePFProducts} from '../lib/pf-catalog-store.mjs';
test('product navigation matches PF names and order and includes every supplier subcategory',()=>{
 assert.deepEqual(productGroups.map(g=>g.name),['Tekstil','Tasker','Drikkeartikler','Kuglepenne og skriveartikler','Teknologi','Notesbøger og papir','Paraplyer','Hjem og livsstil','Messe','Sport og fritid','Spil og legetøj','Værktøj og biltilbehør','Sundhed og personlig pleje']);
 const products=[{shopCategory:'tasker',category:'Bomuldstasker'},{shopCategory:'tasker',category:'Muleposer'},{shopCategory:'tasker',category:'Muleposer'},{shopCategory:'tasker',category:'Ny PF-kategori'},{shopCategory:'papir',category:'Notesbøger'}];
 const items=groupSections(productGroups.find(g=>g.id==='tasker'),products)[0].items;
 assert.equal(items.find(i=>i.name==='Muleposer').count,2);assert.ok(items.some(i=>i.name==='Ny PF-kategori'));assert.ok(!items.some(i=>i.name==='Notesbøger'));
 assert.equal(productGroupURL('toj','Caps & hatte'),'/produkter?kategori=toj&underkategori=Caps+%26+hatte');
});
test('catalogue summaries and product details use matching PF groups without losing products',async()=>{
 const index=await loadCatalogIndex(),summaries=new Map(index.products.map(p=>[p.id,p]));let count=0;
 for await(const product of iteratePFProducts()){
  const group=productGroups.find(g=>g.id===product.shopCategory);assert.ok(group,product.id);assert.equal(product.group,group.name,product.id);assert.equal(summaries.get(product.id).shopCategory,product.shopCategory);count++;
 }
 assert.equal(count,index.products.length);
});
