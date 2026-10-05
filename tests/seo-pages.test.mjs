import test from 'node:test';
import assert from 'node:assert/strict';
import {seoPage,seoHead,seoMain,sitemapXML,robotsTXT,verifiedProductOffer} from '../dist/seo-pages.mjs';

const catalog={
 products:[{id:'pf-123',name:'Blå flaske & kop',brand:'Testbrand',brandId:'testbrand',modelCode:'123',shopCategory:'flasker',category:'Drikkeflasker',variants:[{sku:'12301',color:'Blå',images:['https://images.example.com/123.jpg'],discontinued:false}]}],
 brands:[{id:'testbrand',name:'Testbrand'}]
};

test('public category has a descriptive, stable canonical; faceted searches are noindex',()=>{
 const category=seoPage('/produkter','?kategori=flasker&underkategori=Drikkeflasker',catalog);
 assert.match(category.title,/Drikkeflasker med logo/);
 assert.equal(category.canonical,'https://smerch.dk/produkter?kategori=flasker&underkategori=Drikkeflasker');
 assert.equal(category.robots,'index,follow,max-image-preview:large');
 const search=seoPage('/produkter','?kategori=flasker&q=blå',catalog);
 assert.equal(search.robots,'noindex,follow');
 assert.equal(search.canonical,'https://smerch.dk/produkter?kategori=flasker');
});

test('product metadata and initial HTML use visible product data safely',()=>{
 const page=seoPage('/design/pf-123','',catalog,{description:'Blå flaske med logo.'});
 assert.equal(page.kind,'product');
 assert.match(seoHead(page),/<link rel="canonical" href="https:\/\/smerch.dk\/design\/pf-123">/);
 assert.match(seoHead(page),/application\/ld\+json/);
 assert.match(seoMain(page,catalog),/alt="Blå flaske &amp; kop i farven Blå"/);
 assert.equal(seoPage('/design/pf-missing','',catalog),null);
});

test('sitemap includes visible products, category and image, but no cart or filters',()=>{
 const xml=sitemapXML(catalog);
 assert.match(xml,/<loc>https:\/\/smerch.dk\/design\/pf-123<\/loc>/);
 assert.match(xml,/<image:loc>https:\/\/images.example.com\/123.jpg<\/image:loc>/);
 assert.match(xml,/kategori=flasker&amp;underkategori=Drikkeflasker/);
 assert.doesNotMatch(xml,/\/kurv|q=/);
 assert.match(robotsTXT,/Sitemap: https:\/\/smerch.dk\/sitemap.xml/);
});

test('offer is published only for a live checkout with current price and sufficient verified stock',()=>{
 const product=catalog.products[0],prices={available:true,products:{'pf-123':{fromIncVat:1000,fromQuantity:25}},skus:{'12301':true}},stock={available:true,items:{'12301':{available:25}}},checkout={ready:true,mode:'live'};
 assert.equal(verifiedProductOffer(product,prices,stock,{ready:true,mode:'test'}),null);
 assert.equal(verifiedProductOffer(product,prices,{...stock,available:false},checkout),null);
 assert.equal(verifiedProductOffer(product,prices,{...stock,items:{'12301':{available:24}}},checkout),null);
 const page=seoPage('/design/pf-123','',catalog,null,{prices,stock,checkout});
 const offer=page.schema.find(item=>item['@type']==='Product').offers;
 assert.equal(offer.price,'10.00');
 assert.equal(offer.eligibleQuantity.minValue,25);
 assert.equal(offer.availability,'https://schema.org/InStock');
});
