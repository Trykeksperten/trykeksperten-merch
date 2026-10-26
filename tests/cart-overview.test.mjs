import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.indexedDB={open:()=>({})};
const {cartOverviewHTML,kroner}=await import('../dist/pf-cart.mjs');
const {setCustomerType}=await import('../dist/customer-pricing.mjs');
const data={products:[{id:'book',name:'Notesbog <L>',variants:[{sku:'123',color:'Sort'}]}]};
const lines=[{productId:'book',sku:'123',quantity:20,decorations:[{}]}];
const price={goodsUnit:15800,goods:316000,print:101320,setup:33750,net:451070,vat:112768,totalIncVat:563838,decorationPrices:[{method:'Folie',position:'Bagside',colors:1,printUnit:5066,print:101320,setup:33750,smallOrder:0}]};
const quote={...price,lines:[price]};
const freight={exVat:25000,incVat:31250};
test('business overview includes freight and its VAT exactly once in the expected total',()=>{
 setCustomerType('business');const html=cartOverviewHTML(data,lines,quote,freight);
 assert.ok(html.includes(kroner(595088)));assert.ok(html.includes(kroner(119018)));
 assert.ok(html.includes('20 × '+kroner(15800)));assert.ok(html.includes('20 × '+kroner(5066)));
 assert.ok(html.includes('Folie · Bagside · 1 farve'));assert.ok(html.includes(kroner(33750)));
 assert.ok(html.includes('Notesbog &lt;L&gt;'));assert.ok(!html.includes('Samlet pris</h3>'));
 assert.ok(!html.includes('Småoplagstillæg'));assert.equal((html.match(/Opstart efter evt. rabat/g)||[]).length,1);
 assert.ok(!html.includes('<details class="pf-overview-details" open'));
});
test('consumer shows gross prices without adding VAT a second time',()=>{
 setCustomerType('consumer');const html=cartOverviewHTML(data,lines,quote,freight);
 assert.ok(html.includes(kroner(563838)));assert.ok(html.includes(kroner(595088)));
 assert.ok(html.includes('20 × '+kroner(19750)));assert.ok(!html.includes('Moms (25 %)'));
});
test('unknown freight is explicit and does not inflate the total',()=>{
 setCustomerType('business');const html=cartOverviewHTML(data,lines,quote);
 assert.ok(html.includes('Beregnes ved betaling'));assert.ok(html.includes('I alt uden fragt'));
 assert.ok(html.includes(kroner(563838)));assert.ok(!html.includes('Forventet total'));
});
test('each placement retains its setup and small order fee',()=>{
 const second={...price.decorationPrices[0],position:'Forside',colors:2,smallOrder:1200};
 const html=cartOverviewHTML(data,lines,{...quote,lines:[{...price,decorationPrices:[...price.decorationPrices,second]}]});
 assert.ok(html.includes('Folie · Forside · 2 farver'));assert.ok(html.includes('Småoplagstillæg'));
 assert.ok(html.includes(kroner(1200)));assert.equal((html.match(/Opstart efter evt. rabat/g)||[]).length,2);
});
test('unavailable prices remain pending instead of becoming a numeric total',()=>{
 const html=cartOverviewHTML(data,lines,{totalIncVat:null,message:'Afventer pris',lines:[{message:'Afventer pris'}]});
 assert.ok(html.includes('Pris afventer'));assert.ok(!html.includes('Forventet total'));assert.ok(!html.includes('NaN'));
});
