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

test('mobile blur before an image click does not remove the suggestion',async()=>{
 const {bindProductSearch}=await import('../dist/product-search.mjs');
 const listeners=new Map(),formListeners=new Map(),documentListeners=new Map();
 const panel={id:'',hidden:true,addEventListener:(type,fn)=>listeners.set(type,fn)};
 const beforeDocument=globalThis.document,beforeWindow=globalThis.window;
 globalThis.document={createElement:()=>panel,addEventListener:(type,fn)=>documentListeners.set(type,fn)};
 globalThis.window={addEventListener(){}};
 const input={setAttribute(){},addEventListener(){}};
 const link={getAttribute:()=>'/design/pf-100753'},image={closest:()=>link};
 const form={append(){},contains:target=>[input,link,image].includes(target),addEventListener:(type,fn)=>formListeners.set(type,fn)};
 const visited=[];
 try{
  bindProductSearch({form,input,getCatalog:()=>({products:[]}),getPrices:()=>({}),navigate:path=>visited.push(path)});
  panel.hidden=false;
  documentListeners.get('pointerdown')({target:image});
  formListeners.get('focusout')({relatedTarget:null});
  assert.equal(panel.hidden,false,'keyboard dismissal must not hide the tapped image');
  assert.deepEqual(visited,[],'touch/scroll alone must not navigate');
  listeners.get('click')({target:image,preventDefault(){},stopPropagation(){}});
  assert.deepEqual(visited,['/design/pf-100753']);
  assert.equal(panel.hidden,true);
  panel.hidden=false;
  documentListeners.get('pointerdown')({target:{}});
  assert.equal(panel.hidden,true,'outside touch closes suggestions');
  panel.hidden=false;
  formListeners.get('focusout')({relatedTarget:{}});
  assert.equal(panel.hidden,true,'keyboard tab to another control closes suggestions');
 }finally{globalThis.document=beforeDocument;globalThis.window=beforeWindow;}
});
