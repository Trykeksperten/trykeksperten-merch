import test from 'node:test';
import assert from 'node:assert/strict';
import {brandDiscoveryGroups,brandDiscoveryPage,selectDiscoveryProducts,galleryImageFormat,composeGallery} from '../dist/brand-discovery.mjs';
const brands=[{id:'camelbak',name:'CamelBak',group:'Drikkegrej'},{id:'karst',name:'Karst',group:'Kontor'},{id:'miir',name:'MiiR',group:'Drikkegrej'},{id:'thule',name:'Thule',group:'Tasker'},{id:'empty',name:'Empty',group:'Tasker'},{id:'unbranded',name:'Unbranded',group:'Kontor'},{id:'trykeksperten-select',name:'Trykeksperten Select',group:'Kontor'}];
const products=brands.filter(b=>b.id!=='empty').flatMap(b=>Array.from({length:6},(_,i)=>({id:b.id+'-'+i,name:b.name+' product '+i,brandId:b.id,popularity:100-i,variants:[{sku:b.id+'-'+i,color:'Sort',images:['https://example.com/'+b.id+'-'+i+'.jpg']}]})));
const prices={available:true,products:Object.fromEntries(products.map(p=>[p.id,{fromIncVat:25000+Number(p.id.slice(-1))*10000}])),skus:Object.fromEntries(products.map(p=>[p.variants[0].sku,true])),variantPrices:Object.fromEntries(products.map(p=>[p.variants[0].sku,{fromIncVat:25000,fromExVat:20000,fromQuantity:25}]))};
test('curated collage keeps brand photos near their own products and varies the order, not the assortment',()=>{
 const groups=brandDiscoveryGroups(brands,products,prices,{seed:17});assert.equal(groups.length,4);
 for(const group of groups){assert.equal(group.products.length,3);assert.ok(group.products.every(p=>p.brandId===group.brand.id));assert.ok(group.image);assert.ok(group.products.some(p=>p.id.endsWith('-0')));assert.ok(group.products.some(p=>p.id.endsWith('-5')));}
 const ids=seed=>brandDiscoveryGroups(brands,products,prices,{seed}).map(g=>g.brand.id);
 assert.deepEqual(ids(17),ids(17));assert.notDeepEqual(ids(17),ids(901));assert.equal(brandDiscoveryGroups(brands,products,prices,{limit:2}).length,2);
});
test('the product edit includes popularity and price leaders without duplicates or unavailable variants',()=>{
 const choices=products.filter(p=>p.brandId==='thule');const selected=selectDiscoveryProducts(choices,prices,{seed:1});
 assert.equal(new Set(selected.map(p=>p.id)).size,3);assert.equal(selected[0].id,'thule-0');assert.equal(selected[1].id,'thule-5');
 const unavailable={...prices,skus:{...prices.skus,'thule-5':false}};assert.ok(selectDiscoveryProducts(choices,unavailable).every(p=>p.id!=='thule-5'));
 const anchor={...choices[2],id:'pf-120632'};const result=selectDiscoveryProducts([anchor,...choices],prices);assert.equal(result[0].id,'pf-120632');assert.ok(result.some(p=>p.id==='thule-0'));assert.ok(result.some(p=>p.id==='thule-5'));
});
test('scoped links remain supported and unpriced products are not shown',()=>{
 assert.ok(brandDiscoveryGroups(brands,products,prices,{category:'Drikkegrej'}).every(g=>g.brand.group==='Drikkegrej'));
 assert.deepEqual(brandDiscoveryGroups(brands,products,prices,{selected:'karst'}).map(g=>g.brand.id),['karst']);
 assert.equal(brandDiscoveryGroups(brands,products,{available:false}).length,0);
});
test('image-only gallery links to its own brand without visible names, products or prices',()=>{
 const html=brandDiscoveryPage(brands,'?brand=karst',products,prices);
 assert.match(html,/brand-gallery/);assert.match(html,/data-discovery-brand="karst"/);assert.match(html,/brand-campaign\/karst-/);
 assert.match(html,/href="\/produkter\?brand=karst"/);assert.match(html,/aria-label="Se produkter fra Karst"/);
 assert.doesNotMatch(html,/data-card-product|product-card|editorial-price|editorial-swatches|brand-collage-intro|>Karst<|data-discovery-brand="camelbak"/);
});
test('gallery includes brands beyond the former shortlist and all their campaign images',()=>{
 const expandedBrands=[...brands,{id:'luxe',name:'Luxe',group:'Kontor'}];
 const expandedProducts=[...products,{...products[0],brandId:'luxe'}];
 const groups=brandDiscoveryGroups(expandedBrands,expandedProducts,prices,{seed:17});
 const luxe=groups.find(g=>g.brand.id==='luxe');assert.ok(luxe);assert.equal(luxe.images.length,2);
 const html=brandDiscoveryPage(expandedBrands,'',expandedProducts,prices);
 assert.match(html,/luxe-1.webp/);assert.match(html,/luxe-2.webp/);
 assert.equal((html.match(/class="brand-gallery-tile(?: brand-gallery-tile--wide)?"/g)||[]).length,groups.reduce((sum,g)=>sum+g.images.length,0));
 assert.equal((html.match(/luxe-1.webp/g)||[]).length,1);
});

test('wide campaign artwork keeps its native proportions in the gallery',()=>{
 assert.equal(galleryImageFormat('<img width="888" height="450">').ratio,888/450);
 const html=brandDiscoveryPage(brands,'?brand=camelbak',products,prices);
 assert.match(html,/camelbak-extra-12.webp/);assert.match(html,/--image-ratio:1.9733/);
});
test('brand discovery excludes Elevate imagery even when products are available',()=>{
 const html=brandDiscoveryPage([...brands,{id:'elevate',name:'Elevate'}],'',[...products,{...products[0],brandId:'elevate'}],prices);
 assert.doesNotMatch(html,/elevate-/);
});
test('mixed-format collage keeps every image exactly once and fills rows without fixed maximum widths',()=>{
 const tiles=Array.from({length:25},(_,i)=>({ratio:[.75,.8,1.5,1.97,1,4.5][i%6],width:1600,featured:i%3===0,html:`<a data-photo="${i}"></a>`}));
 const html=composeGallery(tiles).join('');
 for(let i=0;i<tiles.length;i++)assert.equal((html.match(new RegExp(`data-photo="${i}"`,'g'))||[]).length,1);
 assert.match(html,/brand-gallery-column--stack/);
 assert.doesNotMatch(html,/max-width:|NaN|Infinity/);
 assert.deepEqual(composeGallery([]),[]);
 assert.match(composeGallery([tiles[0]]).join(''),/data-photo="0"/);
});
