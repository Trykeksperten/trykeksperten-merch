import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {brandLogoURL} from '../dist/brand-logos.mjs';
import {seoMain,seoPage} from '../dist/seo-pages.mjs';
const added=['boompods','case-logic','chipolo','elevate','graid','journalbooks','luxe','marksman','mepal','originalhome','prixton','rfx','roly','scx-design','seasons','skross','stac','tekio','wellmark','xtorm','zens'];
test('missing feed logos resolve to actual path-based local SVGs',()=>{
 for(const id of added){
  const url=brandLogoURL({id,logo:null});assert.match(url,/\.svg\?v=3$/);
  const path=new URL('../dist'+url.split('?')[0],import.meta.url);assert.ok(existsSync(path));
  const svg=readFileSync(path,'utf8');assert.match(svg,/<(?:\w+:)?path\b/);assert.match(svg,/viewBox=/);assert.doesNotMatch(svg,/<(?:image|script|foreignObject|text)\b/i);
 }
 assert.equal(brandLogoURL({id:'unbranded'}),null);
});
test('server first paint uses new logos even when the imported catalogue has no logo',()=>{
 for(const id of added){const catalogue={products:[{id:'pf-test',brandId:id,brand:id,name:'Test product',variants:[{sku:'1',images:[]}]}],brands:[{id,name:id,logo:null}]};const html=seoMain(seoPage('/produkter','?brand='+id,catalogue),catalogue);assert.ok(html.includes(brandLogoURL({id})),id);}
});
