import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {createCatalogDetailLoader} from '../lib/catalog-detail-loader.mjs';
import {loadPFProduct} from '../lib/pf-catalog-store.mjs';
const shardFor=id=>id.split('-')[0];
test('concurrent product misses share shard reads and no more than two decodes run together',async()=>{
 let active=0,maxActive=0;const reads=new Map();
 const load=createCatalogDetailLoader(async key=>{active++;maxActive=Math.max(maxActive,active);reads.set(key,(reads.get(key)||0)+1);await delay(10);active--;return ['a','b'].map(s=>({id:key+'-'+s}));},{shardFor});
 const ids=Array.from({length:20},(_,i)=>String(i%4).padStart(2,'0')+'-'+(Math.floor(i/4)%2?'a':'b'));
 const rows=await Promise.all(ids.map(load));assert.deepEqual(rows.map(r=>r.id),ids);assert.equal(maxActive,2);assert.equal([...reads.values()].reduce((a,b)=>a+b,0),4);
 assert.equal(await load(ids[0]),rows[0]);
});
test('requested-product cache survives shard eviction and is bounded by LRU entry count',async()=>{
 const reads=[];const load=createCatalogDetailLoader(async key=>{reads.push(key);return [{id:key+'-a'}];},{shardFor,capacity:2,shardCapacity:1});
 const a=await load('00-a');await load('01-a');assert.equal(await load('00-a'),a);await load('02-a');await load('01-a');assert.deepEqual(reads,['00','01','02','01']);
});
test('byte budget evicts products and failed shard reads can be retried without blocking the queue',async()=>{
 let fail=true;const reads=[];const load=createCatalogDetailLoader(async key=>{reads.push(key);if(key==='00'&&fail){fail=false;throw Error('synthetic read failure');}return [{id:key+'-a',text:'x'.repeat(40)}];},{shardFor,capacity:3,byteLimit:80,shardCapacity:1});
 const first=load('00-a'),queued=load('01-a');await assert.rejects(first,/synthetic/);assert.equal((await queued).id,'01-a');await load('00-a');await load('01-a');assert.deepEqual(reads,['00','01','00','01']);await assert.rejects(load('01-missing'),/findes/);assert.equal((await load('02-a')).id,'02-a');
});
test('real concurrent product requests return one unchanged product instance',async()=>{
 const products=await Promise.all(Array.from({length:16},()=>loadPFProduct('pf-100165')));assert.equal(new Set(products).size,1);assert.equal(products[0].id,'pf-100165');assert.ok(products[0].variants.length>0);
});
