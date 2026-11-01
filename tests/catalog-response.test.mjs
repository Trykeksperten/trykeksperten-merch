import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {createCatalogResponse} from '../lib/catalog-response.mjs';
import {loadCatalogIndex} from '../lib/pf-catalog-store.mjs';
test('real catalogue loader reuses the snapshot consumed by the response cache',async()=>{
 const cold=await Promise.all(Array.from({length:16},()=>loadCatalogIndex()));
 assert.equal(new Set(cold).size,1);
 const first=cold[0],second=await loadCatalogIndex();
 assert.equal(first,second);assert.ok(first.products.length>0);
});
test('catalogue serialization/compression shared by concurrent clients and invalidated for visibility and revision',async()=>{
 let catalog={products:[{id:'A',text:'x'.repeat(2000)}]},state={overrides:{}},builds=0;
 const send=createCatalogResponse({loadCatalog:async()=>catalog,readAssortment:async()=>structuredClone(state),publicAssortment:(c,s)=>{builds++;return {products:c.products.filter(p=>s.overrides[p.id]!==false)};}});
 const request=async(encoding='gzip',method='GET')=>{const result={};await send({method,headers:{'accept-encoding':encoding}},{writeHead(status,headers){result.status=status;result.headers=headers;},end(data){result.data=data;}});return result;};
 const responses=await Promise.all(Array.from({length:10},()=>request()));assert.equal(builds,1);assert.ok(responses.every(r=>r.data===responses[0].data));assert.deepEqual(JSON.parse(gunzipSync(responses[0].data)),catalog);
 const identity=await request('identity');assert.deepEqual(JSON.parse(identity.data),catalog);assert.equal(builds,1);
 const head=await request('gzip','HEAD');assert.equal(head.data,undefined);assert.equal(head.headers['Content-Length'],responses[0].data.length);
 state.overrides.A=false;assert.deepEqual(JSON.parse((await request('identity')).data),{products:[]});assert.equal(builds,2);
 catalog={products:[{id:'B'}]};assert.deepEqual(JSON.parse((await request('identity')).data),catalog);assert.equal(builds,3);
});
