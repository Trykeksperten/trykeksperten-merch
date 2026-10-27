import test from 'node:test';
import assert from 'node:assert/strict';
import {brandEditorialBlocks,showBrandEditorial} from '../dist/brand-editorial.mjs';
test('brand photographs are placed after real product cards, including small assortments',()=>{
 for(const [brand,count,positions] of [['herschel',4,[2,4]],['hydro-flask',6,[4]],['ocean-bottle',12,[4,12]],['stanley-1913',22,[4]],['chipolo',2,[2]]]){
  const blocks=brandEditorialBlocks(brand,count);assert.deepEqual([...blocks.keys()],positions);
  for(const html of blocks.values()){assert.match(html,/loading="lazy"/);assert.match(html,/\/assets\/brand-lifestyle\//);assert.doesNotMatch(html,/product-card|href=/);}
 }
 assert.equal(brandEditorialBlocks('karst',12).size,0);assert.equal(brandEditorialBlocks('chipolo',0).size,0);
 assert.deepEqual([...brandEditorialBlocks('herschel',1).keys()],[1]);
});
test('photos appear on the first brand page, keeping searches and filtered results focused on products',()=>{
 for(const query of ['brand=herschel','brand=herschel&sortering=price-asc','brand=chipolo&side=1'])assert.equal(showBrandEditorial(new URLSearchParams(query),1),true);
 for(const query of ['', 'brand=herschel&q=taske','brand=herschel&farve=Sort','brand=herschel&kategori=tasker'])assert.equal(showBrandEditorial(new URLSearchParams(query),1),false);
 assert.equal(showBrandEditorial(new URLSearchParams('brand=herschel&side=2'),2),false);
});
