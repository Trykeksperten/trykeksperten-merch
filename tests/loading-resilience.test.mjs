import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {fetchJSON} from '../dist/fetch-json.mjs';
import {sendPublicJSON} from '../lib/json-response.mjs';
test('read requests recover from temporary failures but never retry a missing product',async()=>{
 let calls=0;
 assert.deepEqual(await fetchJSON('/product',{fetchImpl:async()=>++calls===1?{ok:false,status:503}:{ok:true,json:async()=>({id:1})}}),{id:1});
 assert.equal(calls,2);calls=0;
 await assert.rejects(fetchJSON('/product',{fetchImpl:async()=>{calls++;return {ok:false,status:404};}}));assert.equal(calls,1);
});
test('stalled request bodies time out and retry only once',async()=>{
 let calls=0;
 await assert.rejects(fetchJSON('/product',{timeout:5,fetchImpl:async(url,{signal})=>{calls++;return {ok:true,json:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))};}}),/lang tid/);
 assert.equal(calls,2);
});
test('catalogue JSON is compressed losslessly with a plain fallback',async()=>{
 const value={products:Array(100).fill({name:'Produkt',id:123})};
 for(const encoding of ['gzip, deflate','gzip;q=0','']){
  let headers,body;const res={writeHead(status,h){assert.equal(status,200);headers=h;},end(b){body=b;}};
  await sendPublicJSON({method:'GET',headers:{'accept-encoding':encoding}},res,value);
  assert.deepEqual(JSON.parse(headers['Content-Encoding']?gunzipSync(body):body),value);
  assert.equal(Boolean(headers['Content-Encoding']),encoding==='gzip, deflate');
  assert.equal(headers.Vary,'Accept-Encoding');
 }
});
