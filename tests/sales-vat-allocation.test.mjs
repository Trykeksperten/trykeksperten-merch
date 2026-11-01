import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateShipment} from '../lib/sales-finance.mjs';
import {prepareCheckout} from '../lib/checkout.mjs';
import {loadPFProduct} from '../lib/pf-catalog-store.mjs';
const sum=(rows,key)=>rows.reduce((n,row)=>n+row[key],0);
async function checkoutFixture(){const product=await loadPFProduct('pf-38687'),variants=product.variants.slice(0,2),stamp=new Date().toISOString();return prepareCheckout({lines:variants.map(v=>({productId:product.id,sku:v.sku,quantity:1,decorations:[]})),shipping:{name:'Test',email:'test@example.invalid',phone:'12345678',street:'Testvej 1',postalCode:'1000',city:'Test',country:'DK'},legal:{customerType:'consumer'}},{catalog:{products:[product]},prices:{productDate:stamp,printDate:stamp,products:Object.fromEntries(variants.map(v=>[v.sku,{currency:'DKK',tiers:[{min:1,net:100.01}]}])),prints:{}},rules:{goodsMarkup:0,printMarkup:0},stock:{updatedAt:stamp,items:Object.fromEntries(variants.map(v=>[v.sku,{available:100}]))},env:{PAYMENT_PROVIDER:'quickpay',QUICKPAY_MODE:'test',QUICKPAY_API_KEY:'test',QUICKPAY_PRIVATE_KEY:'test',SMERCH_PUBLIC_BASE_URL:'https://example.invalid',SMERCH_BLANK_SHIPPING_COUNTRY:'PL'}});}
function locked(){return {lines:[{sku:'A',quantity:3},{sku:'B',quantity:2}],quote:{net:10102,vat:2525,totalIncVat:12627,lines:[{net:10001,vat:2500,totalIncVat:12501},{net:101,vat:25,totalIncVat:126}]},freightExVat:10,freightIncVat:13,totalIncVat:12640};}

test('actual checkout 462.52 DKK allocates its accepted VAT exactly, both whole and split',async()=>{
 const order=await checkoutFixture();assert.equal(order.totalIncVat,46252);assert.equal(Math.round((order.quote.net+order.freightExVat)*1.25),46253);
 const full=allocateShipment(order,[],[{index:0,quantity:1},{index:1,quantity:1}]);assert.equal(full.total,46252);assert.equal(full.vat,9250);assert.equal(full.freightVat,3000);assert.equal(full.allocationBasis,'locked_vat_v1');assert.deepEqual(full.lines.map(l=>l.vat),[3125,3125]);
 const split=[];for(const index of [1,0])split.push(allocateShipment(order,split,[{index,quantity:1}]));for(const key of ['net','vat','total','freight','freightVat'])assert.equal(sum(split,key),full[key]);
});

test('cumulative locked line VAT and freight VAT sum exactly across uneven partial quantities and delivery orders',()=>{
 const order=locked();for(const sequence of [[0,0,0,1,1],[1,0,1,0,0],[0,1,0,1,0]]){const rows=[];for(const index of sequence)rows.push(allocateShipment(order,rows,[{index,quantity:1}]));assert.equal(sum(rows,'total'),12640);assert.equal(sum(rows,'net'),10112);assert.equal(sum(rows,'vat'),2528);assert.equal(sum(rows,'freight'),10);assert.equal(sum(rows,'freightVat'),3);for(const index of [0,1]){const lines=rows.flatMap(s=>s.lines).filter(l=>l.index===index);assert.equal(sum(lines,'net'),order.quote.lines[index].net);assert.equal(sum(lines,'vat'),order.quote.lines[index].vat);}assert.throws(()=>allocateShipment(order,rows,[{index:0,quantity:1}]),/antal/);}
});

test('one-cent inconsistencies are rejected; accepted rounding never becomes a general tolerance',()=>{
 for(const change of [o=>o.totalIncVat++,o=>o.quote.vat++,o=>o.freightIncVat++,o=>{o.quote.lines[0].vat++;o.quote.lines[0].totalIncVat++;o.quote.vat++;o.quote.totalIncVat++;o.totalIncVat++;},o=>delete o.quote.lines[0].vat&&delete o.quote.lines[0].totalIncVat]){const o=locked();change(o);assert.throws(()=>allocateShipment(o,[],[{index:0,quantity:1}]),/moms|summer/);}
 const o=locked(),old=allocateShipment(o,[],[{index:0,quantity:1}]);old.vat++;old.total++;assert.throws(()=>allocateShipment(o,[old],[{index:0,quantity:1}]),/Tidligere leverancers/);
});

test('legacy net-only orders retain their exact aggregate allocation and prior recorded amounts',()=>{
 const o={lines:[{sku:'A',quantity:3}],quote:{lines:[{net:10000}]},freightExVat:10,totalIncVat:12513},old={lines:[{index:0,sku:'A',quantity:1,net:3333}],freight:3,net:3336,vat:834,total:4170},unchanged=structuredClone(old);
 const rest=allocateShipment(o,[old],[{index:0,quantity:2}]);assert.equal(rest.allocationBasis,'legacy_aggregate_v1');assert.equal(rest.total,8343);assert.equal(rest.total+old.total,o.totalIncVat);assert.deepEqual(old,unchanged);
 assert.throws(()=>allocateShipment({...o,totalIncVat:o.totalIncVat+1},[],[{index:0,quantity:1}]),/momsopsætning/);
});

test('historical aggregate allocation on a VAT-snapshotted order stays immutable while the remaining exact total is allocated',()=>{
 const o={lines:[{sku:'A',quantity:3}],quote:{lines:[{net:10001,vat:2500,totalIncVat:12501}]},freightExVat:12000,freightIncVat:15000,totalIncVat:27501};
 const fresh=allocateShipment(o,[],[{index:0,quantity:1}]);assert.equal(fresh.total,9167);
 const old={lines:[{index:0,sku:'A',quantity:1,net:3334}],freight:4000,net:7334,vat:1834,total:9168},original=structuredClone(old);
 const rest=allocateShipment(o,[old],[{index:0,quantity:2}]);assert.equal(rest.allocationBasis,'legacy_aggregate_v1');assert.equal(rest.total+old.total,27501);assert.deepEqual(old,original);
 const corrupt={...old,vat:1835,total:9169};assert.throws(()=>allocateShipment(o,[corrupt],[{index:0,quantity:2}]),/Tidligere leverancers/);
});

test('locked quote gross can recover a missing line VAT field only when the exact Danish amount matches',()=>{
 const o=locked();delete o.quote.lines[0].vat;const full=allocateShipment(o,[],[{index:0,quantity:3},{index:1,quantity:2}]);assert.equal(full.total,o.totalIncVat);assert.equal(full.allocationBasis,'locked_vat_v1');
 o.quote.lines[0].totalIncVat++;assert.throws(()=>allocateShipment(o,[],[{index:0,quantity:1}]),/moms/);
});
