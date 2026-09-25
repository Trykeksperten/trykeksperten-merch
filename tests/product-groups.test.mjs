import test from 'node:test';
import assert from 'node:assert/strict';
import {productGroups,groupSections,productGroupURL} from '../dist/product-groups.mjs';

test('category navigation keeps cotton bags separate and omits empty supplier subcategories',()=>{
 const products=[
  {shopCategory:'bomuldstasker',category:'Muleposer'},
  {shopCategory:'bomuldstasker',category:'Bomuldstasker'},
  {shopCategory:'tasker',category:'Muleposer'},
  {shopCategory:'tasker',category:'Rygsække'}
 ];
 const cotton=groupSections(productGroups.find(group=>group.id==='bomuldstasker'),products);
 const bags=groupSections(productGroups.find(group=>group.id==='tasker'),products);
 assert.equal(cotton[0].items.find(item=>item.name==='Muleposer').count,1);
 assert.equal(bags.find(section=>section.name==='Tasker').items.find(item=>item.name==='Muleposer').count,1);
 assert.equal(cotton[0].items.some(item=>item.name==='Køletasker'),false);
 assert.equal(productGroupURL('bomuldstasker','Muleposer'),'/produkter?kategori=bomuldstasker&underkategori=Muleposer');
});
