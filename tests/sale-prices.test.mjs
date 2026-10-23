import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveSalePrices,readSalePrices} from '../lib/sale-prices.mjs';
test('manual prices persist independently, validate amounts and support reset',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sale-prices-')),path=join(dir,'prices.json');try{
 const tiers=[{min:1,unitExVat:600},{min:100,unitExVat:450}];
 await Promise.all([saveSalePrices('A',tiers,{path}),saveSalePrices('B',tiers,{path})]);assert.deepEqual(await readSalePrices(path),{A:tiers,B:tiers});
 for(const bad of [[],[{min:2,unitExVat:600}],[{min:1,unitExVat:0}],[{min:1,unitExVat:NaN}],[{min:1,unitExVat:1.5}],[{min:1,unitExVat:600},{min:1,unitExVat:400}]])assert.throws(()=>saveSalePrices('A',bad,{path}));
 await saveSalePrices('A',null,{path});assert.deepEqual(await readSalePrices(path),{B:tiers});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('product-wide prices replace variant overrides atomically and reset together',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sale-product-')),path=join(dir,'prices.json');try{
 const old=[{min:1,unitExVat:900}];await saveSalePrices('A',old,{path});await saveSalePrices('B',old,{path});await saveSalePrices('OTHER',old,{path});
 const options={path,minimum:10,productWide:true,clearSkus:['A','B']};
 assert.throws(()=>saveSalePrices('pf-product',[{min:10,unitExVat:0}],options));assert.deepEqual((await readSalePrices(path)).A,old);
 await saveSalePrices('pf-product',[{min:10,unitExVat:800},{min:100,unitExVat:700}],options);
 assert.deepEqual(await readSalePrices(path),{OTHER:old,'pf-product':[{min:1,unitExVat:800},{min:100,unitExVat:700}]});
 await saveSalePrices('pf-product',null,options);assert.deepEqual(await readSalePrices(path),{OTHER:old});
 }finally{await rm(dir,{recursive:true,force:true});}
});
