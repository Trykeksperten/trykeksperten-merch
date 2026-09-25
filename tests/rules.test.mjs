import test from 'node:test';
import assert from 'node:assert/strict';
import {products,publicCatalog} from '../lib/catalog.mjs';
import {quoteLine,validateLine,filterProducts} from '../dist/rules.mjs';
import {mergeSnapshot,publicProduct} from '../lib/providers.mjs';
const tee=products[0];
const line={color:'Hvid',quantities:{S:25,M:0,L:0,XL:0,XXL:0},method:'transfer',position:'Venstre bryst',options:{}};
test('tier breakpoints include printing and one setup; freight stays unknown',()=>{
 for(const [n,unit] of [[25,65],[99,65],[100,59],[249,59],[250,52]]){
 const q=quoteLine(tee,{...line,quantities:{S:n}});assert.equal(q.unit,unit);assert.equal(q.subtotal,n*(unit+12)+250);assert.equal(q.freight,null);
 }
});
test('reject invalid quantities, colour, print and size combinations',()=>{
 for(const l of [{...line,quantities:{S:24}},{...line,quantities:{S:25.5}},{...line,quantities:{S:-1,M:26}},{...line,quantities:{UNKNOWN:25}},{...line,color:'Pink'},{...line,method:'embroidery',position:'Ryg'}]) assert.ok(validateLine(tee,l));
 assert.equal(validateLine(tee,{...line,quantities:{S:10,M:15}}),null);
});
test('unknown product prices must never produce a zero subtotal',()=>{
 const p=products.find(p=>p.id==='flyer');const l={color:'Fuld farve',quantities:{Standard:100},method:'digital',position:'Forside',options:{Format:'A5',Papir:'170 g bestrøget',Efterbehandling:'Ingen'}};
 assert.equal(quoteLine(p,l).subtotal,null);assert.ok(validateLine(p,{...l,options:{...l.options,Format:'A0'}}));
});
test('combined URL filters and price sorting',()=>{
 assert.deepEqual(filterProducts(products,new URLSearchParams('kategori=toj&farve=Hvid&materiale=Bomuld')).map(p=>p.id),['classic-tee']);
 assert.equal(filterProducts(products,new URLSearchParams('q=zzzzzz')).length,0);
 assert.ok(filterProducts(products,new URLSearchParams('sortering=pris-stigende')).at(-1).price===null);
});
test('public projection excludes procurement secrets',()=>{
 const p=publicProduct({...tee,purchasePrice:3,apiToken:'SECRET'});assert.ok(!JSON.stringify(p).includes('SECRET'));assert.ok(!('purchasePrice' in p));assert.ok(publicCatalog().products.every(p=>!p.supplier));
});
test('sync preserves editorial overrides, retires absent items, groups verified duplicates, rejects failures',()=>{
 const overrides={gtin123:{name:'Min egen tekst',category:'egen',salesRules:{margin:42}}};
 const a=mergeSnapshot({}, {supplierId:'pf',complete:true,records:[{productId:'1',canonicalKey:'gtin123'},{productId:'2'}]},overrides);
 const b=mergeSnapshot(a,{supplierId:'promidata',complete:true,records:[{productId:'x',canonicalKey:'gtin123'}]},overrides);
 assert.equal(b.products.find(p=>p.id==='gtin123').sources.length,2);assert.deepEqual(b.products.find(p=>p.id==='gtin123').editorial,overrides.gtin123);
 const c=mergeSnapshot(b,{supplierId:'pf',complete:true,records:[{productId:'1',canonicalKey:'gtin123'}]},overrides);assert.equal(c.sources['pf:2'].status,'discontinued');
 const d=mergeSnapshot(c,{supplierId:'pf',complete:false,records:[]},overrides);assert.deepEqual(d.sources,c.sources);assert.equal(d.sync.status,'error');
});
