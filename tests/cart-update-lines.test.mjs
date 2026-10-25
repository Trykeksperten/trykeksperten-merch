import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.indexedDB={open:()=>({})};
const storage=new Map();
globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
globalThis.window={dispatchEvent(){}};
globalThis.fetch=async()=>({});
const {readCart,writeCart,putCartLines}=await import('../dist/pf-cart.mjs');
const item=(sku,quantity)=>({productId:'test-product',sku,quantity,decorations:[]});
test('updating added size rows replaces the same group and leaves other products intact',()=>{
 writeCart([{...item('other',3),id:'unrelated'}],{track:false});
 const added=putCartLines([item('black-M',5),item('black-L',7)],[]);
 const updated=putCartLines([item('blue-M',8),item('blue-L',10)],added.map(row=>row.id));
 assert.deepEqual(updated.map(row=>row.id),added.map(row=>row.id));
 assert.equal(readCart().length,3);
 assert.deepEqual(readCart().map(row=>[row.sku,row.quantity]),[['other',3],['blue-M',8],['blue-L',10]]);
 const reduced=putCartLines([item('blue-M',12)],updated.map(row=>row.id));
 assert.equal(readCart().length,2);
 assert.equal(reduced[0].id,added[0].id);
 assert.throws(()=>putCartLines([item('blue-M',1)],updated.map(row=>row.id)),/Åbn produktet/);
});
test('single cart edit IDs remain supported',()=>{
 writeCart([{...item('black',5),id:'existing'}],{track:false});
 putCartLines([item('blue',9)],'existing');
 assert.equal(readCart().length,1);assert.equal(readCart()[0].id,'existing');assert.equal(readCart()[0].sku,'blue');
});
