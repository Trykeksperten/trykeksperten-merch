import test from 'node:test';
import assert from 'node:assert/strict';
import {productDisplayVariant} from '../dist/product-display-variant.mjs';
const variant=(sku,color,extra={})=>({sku,color,images:[sku+'.jpg'],...extra});
const variants=[variant('white','Hvid'),variant('red','Rød'),variant('navy','Marineblå'),variant('green','Skovgrøn'),variant('sand','Sandfarvet'),variant('black','Sort')];
test('default display uses a stable restrained mix of real available variants',()=>{
 const seen=new Set();
 for(let i=0;i<30;i++){
  const product={id:'pf-'+i,variants};const chosen=productDisplayVariant(product);
  assert.ok(['navy','green','sand','black'].includes(chosen.sku));assert.equal(chosen,productDisplayVariant(product));assert.ok(variants.includes(chosen));seen.add(chosen.sku);
 }
 assert.ok(seen.size>=3,'the grid should not show every product in the same colour');
});
test('explicit selections and filtered colours override the editorial default',()=>{
 const product={id:'demo',variants};
 assert.equal(productDisplayVariant(product,variants,'red').sku,'red');
 assert.equal(productDisplayVariant(product,[variants[0]]).sku,'white');
 assert.equal(productDisplayVariant(product,[variants[1]]).sku,'red');
});
test('excluded, discontinued or unpictured variants cannot become the displayed product',()=>{
 const product={id:'demo',variants};
 const selected=[variant('old','Sort',{discontinued:true}),variant('missing','Marineblå',{images:[]}),variant('white','Hvid')];
 assert.equal(productDisplayVariant(product,selected,'old').sku,'white');
 assert.equal(productDisplayVariant(product,[]),undefined);
});
