import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesProductSearch,searchSuggestions} from '../dist/product-search.mjs';
const product={id:'pf-100753',name:'Ocean Bottle Big 1 liter',brand:'Ocean Bottle',modelCode:'100753',variants:[{sku:'10075390'}]};
test('search matches all words regardless of order, case and whitespace',()=>{
 for(const q of ['ocean big','BIG ocean',' big  bottle ocean ','100753 ocean'])assert.ok(matchesProductSearch(product,q));
 assert.equal(matchesProductSearch(product,'ocean stanley'),false);
});
test('suggestions exclude unavailable products and require two characters',()=>{
 const catalog={products:[product,{...product,id:'hidden'}]},prices={available:true,products:{[product.id]:{}},skus:{10075390:true}};
 assert.deepEqual(searchSuggestions(catalog,prices,'big ocean'),[product]);
 assert.deepEqual(searchSuggestions(catalog,prices,'o'),[]);
 assert.deepEqual(searchSuggestions(catalog,{available:false},'big ocean'),[]);
});

test('touch suggestions keep focus until click, while drag/cancel never navigates',async()=>{
 const {bindProductSearch}=await import('../dist/product-search.mjs');
 const listeners=new Map(),inputListeners=new Map(),formListeners=new Map();
 const panel={id:'',hidden:true,addEventListener:(type,fn)=>listeners.set(type,fn)};
 const documentBefore=globalThis.document,windowBefore=globalThis.window;
 globalThis.document={createElement:()=>panel,addEventListener(){}};
 globalThis.window={addEventListener(){}};
 const input={setAttribute(){},addEventListener:(type,fn)=>inputListeners.set(type,fn)};
 const form={append(){},contains:target=>target===input,addEventListener:(type,fn)=>formListeners.set(type,fn)};
 const visited=[];
 try{
  bindProductSearch({form,input,getCatalog:()=>({products:[]}),getPrices:()=>({}),navigate:path=>visited.push(path)});
  const link={getAttribute:()=>'/design/pf-100753'},target={closest:()=>link};
  for(const pointerType of ['touch','pen','mouse']){
   panel.hidden=false;let prevented=false;
   listeners.get('pointerdown')({target,button:0,isPrimary:true,pointerType,preventDefault(){prevented=true;}});
   assert.equal(prevented,true,'prevent focus loss before link activation');
   assert.equal(panel.hidden,false);
   assert.equal(visited.length,0,'pointer down alone must not navigate when scrolling');
  }
  listeners.get('click')({target,preventDefault(){},stopPropagation(){}});
  assert.deepEqual(visited,['/design/pf-100753']);
  assert.equal(panel.hidden,true);
  let blocked=false;
  listeners.get('pointerdown')({target,button:2,isPrimary:true,preventDefault(){blocked=true;}});
  assert.equal(blocked,false,'preserve secondary pointer actions');
 }finally{globalThis.document=documentBefore;globalThis.window=windowBefore;}
});
