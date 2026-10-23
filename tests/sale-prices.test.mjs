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
test('temporary variant price restores previous price at expiry without a running browser',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sale-timer-')),path=join(dir,'prices.json'),now=1000000;
 const original=[{min:1,unitExVat:900}],offer=[{min:1,unitExVat:700}];
 try{
 await saveSalePrices('A',original,{path});await saveSalePrices('B',original,{path});
 await saveSalePrices('A',offer,{path,durationMinutes:30,now});
 assert.deepEqual(await readSalePrices(path,now+1799999),{A:offer,B:original});
 assert.deepEqual(await readSalePrices(path,now+1800000),{A:original,B:original});
 await saveSalePrices('NEW',offer,{path,durationMinutes:60,now});assert.equal((await readSalePrices(path,now+3600000)).NEW,undefined);
 assert.throws(()=>saveSalePrices('A',offer,{path,durationMinutes:31}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('temporary product price restores variant overrides and respects newer edits',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sale-timer-all-')),path=join(dir,'prices.json'),now=1000000;
 const original=[{min:1,unitExVat:900}],offer=[{min:1,unitExVat:700}],newer=[{min:1,unitExVat:800}];
 try{
 await saveSalePrices('A',original,{path});await saveSalePrices('pf-product',original,{path});
 await saveSalePrices('pf-product',offer,{path,productWide:true,clearSkus:['A','B'],durationMinutes:30,now});
 assert.deepEqual(await readSalePrices(path,now),{'pf-product':offer});
 assert.deepEqual(await readSalePrices(path,now+1800000),{A:original,'pf-product':original});
 await saveSalePrices('A',newer,{path,now:now+1000});
 assert.deepEqual(await readSalePrices(path,now+1800000),{A:newer,'pf-product':original});
 }finally{await rm(dir,{recursive:true,force:true});}
});
