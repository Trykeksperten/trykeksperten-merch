import test from 'node:test';import assert from 'node:assert/strict';
// This branch never reads files. Keep IndexedDB pending and cart storage read-only.
globalThis.indexedDB={open:()=>({})};globalThis.location={search:''};
globalThis.localStorage={getItem:()=>null,setItem:()=>{throw Error('Cart must not be changed by the release check');}};
const {checkoutPage,bindCheckout}=await import('../dist/checkout.mjs');
function fixture(){let html='',closed;const gate={isConnected:true,get html(){return html;},set outerHTML(value){html=value;this.isConnected=false;closed=null;}};closed=gate;globalThis.document={querySelector:selector=>selector==='#checkout-launch-closed'?closed:null};return gate;}
test('closed is the fallback and an opened form still starts with its submit button disabled',()=>{
 assert.match(checkoutPage(),/id="checkout-launch-closed"/);const open=checkoutPage(false,true);assert.match(open,/id="pf-checkout-form"/);assert.match(open,/<button[^>]+type="submit" disabled/);
});
for(const [name,status] of [['closed',{ready:false,launch:{ordersEnabled:false}}],['inconsistent-ready',{ready:true,launch:{ordersEnabled:false}}],['inconsistent-open',{ready:false,launch:{ordersEnabled:true}}],['missing-launch',{ready:true}]])test('UI stays closed for '+name+' API state',async()=>{
 const gate=fixture();globalThis.fetch=async url=>{assert.equal(url,'/api/checkout/status');return Response.json(status);};await bindCheckout();assert.equal(gate.html,'');assert.equal(gate.isConnected,true);
});
test('HTTP errors and connection failures leave the closed page and cart intact',async()=>{
 for(const response of [()=>new Response('',{status:503}),()=>{throw Error('offline');}]){const gate=fixture();globalThis.fetch=async()=>response();await bindCheckout();assert.equal(gate.html,'');}
});
test('only ready and explicitly open server status renders the payment form',async()=>{
 const gate=fixture();globalThis.fetch=async()=>Response.json({ready:true,launch:{ordersEnabled:true}});await bindCheckout();assert.match(gate.html,/id="pf-checkout-form"/);assert.doesNotMatch(gate.html,/checkout-launch-closed/);
});
test('late release response cannot replace a page after navigation',async()=>{
 const gate=fixture();let finish;globalThis.fetch=()=>new Promise(resolve=>{finish=resolve;});const pending=bindCheckout();gate.isConnected=false;finish(Response.json({ready:true,launch:{ordersEnabled:true}}));await pending;assert.equal(gate.html,'');
});
