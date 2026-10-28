import test from 'node:test';
import assert from 'node:assert/strict';
import {brandEditorialBlocks,showBrandEditorial} from '../dist/brand-editorial.mjs';
test('brand photographs are placed after real product cards, including small assortments',()=>{
 for(const [brand,count,positions] of [['herschel',4,[4]],['hydro-flask',6,[4]],['ocean-bottle',12,[4,12]],['stanley-1913',22,[4,12]],['chipolo',2,[2]]]){
  const blocks=brandEditorialBlocks(brand,count);assert.deepEqual([...blocks.keys()],positions);
  for(const html of blocks.values()){assert.match(html,/loading="lazy"/);assert.match(html,/\/assets\/brand-(?:lifestyle|campaign)\//);assert.doesNotMatch(html,/product-card|href=/);}
 }
 assert.equal(brandEditorialBlocks('unknown-brand',12).size,0);assert.equal(brandEditorialBlocks('chipolo',0).size,0);
 assert.deepEqual([...brandEditorialBlocks('herschel',1).keys()],[1]);
});
test('photos appear on the first brand page, keeping searches and filtered results focused on products',()=>{
 for(const query of ['brand=herschel','brand=herschel&sortering=price-asc','brand=chipolo&side=1'])assert.equal(showBrandEditorial(new URLSearchParams(query),1),true);
 for(const query of ['', 'brand=herschel&q=taske','brand=herschel&farve=Sort','brand=herschel&kategori=tasker'])assert.equal(showBrandEditorial(new URLSearchParams(query),1),false);
 assert.equal(showBrandEditorial(new URLSearchParams('brand=herschel&side=2'),2),false);
});

test('Herschel photographs share a single row after the first four products',()=>{
 const blocks=brandEditorialBlocks('herschel',4);assert.equal(blocks.size,1);const html=blocks.get(4);assert.match(html,/brand-lifestyle-pair/);assert.equal((html.match(/<img /g)||[]).length,2);assert.ok(html.indexOf('herschel-1.webp')<html.indexOf('herschel-2.webp'));
});

test('campaign quantity follows the current assortment, up to three photographs',()=>{
 for(const [count,expected] of [[1,1],[9,1],[10,2],[23,2],[24,3],[80,3]]){
  const html=[...brandEditorialBlocks('mepal',count).values()].join('');assert.equal((html.match(/<img /g)||[]).length,expected);
 }
 assert.equal(brandEditorialBlocks('graid',2).size,0);
});
test('brand campaign sources exist locally, have distinct files, and retain wide artwork',async()=>{
 const {brandCampaignPhotos}=await import('../dist/brand-campaign-data.mjs');
 const {stat}=await import('node:fs/promises');
 for(const [brand,photos] of Object.entries(brandCampaignPhotos)){
  assert.equal(new Set(photos.map(p=>p.file)).size,photos.length);
  for(const photo of photos){assert.ok(photo.file.startsWith(brand+'-'));assert.ok(photo.width>0&&photo.height>0);assert.ok((await stat(new URL('../dist/assets/brand-campaign/'+photo.file,import.meta.url))).size>0);}
 }
 assert.match([...brandEditorialBlocks('elevate',24).values()].join(''),/brand-lifestyle--wide/);
});
