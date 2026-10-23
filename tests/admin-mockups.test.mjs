import test from 'node:test';
import assert from 'node:assert/strict';
import {mockupsForPfOrder} from '../dist/admin-mockups.mjs';

test('inbox links each PF order to only its own checkout placement mockups',()=>{
 const checkout={id:'pay-one',pfOrderIds:['ord-a','ord-b'],fulfillmentGroups:[[0,2],[1]],lines:[
  {productId:'shirt',decorations:[{position:'Forside'},{position:'Bagside'}]},
  {productId:'cap',decorations:[{position:'Forside'}]},
  {productId:'bag',decorations:[{position:'Side'}]}],
  mockups:[{lineIndex:0,decorationIndex:0},{lineIndex:0,decorationIndex:1},{lineIndex:1,decorationIndex:0},{lineIndex:2,decorationIndex:0}]
 };
 const cap=mockupsForPfOrder(checkout,{id:'ord-b',checkoutId:'pay-one',checkoutGroupIndex:1});
 assert.equal(cap.length,1);assert.equal(cap[0].label,'cap · Forside');
 assert.equal(cap[0].url,'/api/admin/checkouts/pay-one/mockup/1/0');
 assert.equal(mockupsForPfOrder(checkout,{id:'ord-a',checkoutId:'pay-one',checkoutGroupIndex:0}).length,3);
 assert.deepEqual(mockupsForPfOrder(checkout,{id:'ord-b',checkoutId:'pay-other'}),[]);
});
test('sandbox mockups are visible without a payment checkout or expiring supplier links',()=>{
 const order={id:'ord-test',gatewayPayload:{Header:{isTest:true}},lines:[{productId:'pen',decorations:[{position:'Krop',files:{proof:'https://example.com/signed'}}]},{productId:'bag',decorations:[{position:'Forside',files:{proof:'https://example.com/signed'}}]}]};
 const refs=mockupsForPfOrder(null,order);assert.equal(refs.length,2);assert.equal(refs[1].url,'/api/pf-orders/ord-test/mockup/1/0');assert.equal(refs[1].label,'bag · Forside');
 assert.deepEqual(mockupsForPfOrder(null,{...order,gatewayPayload:{Header:{isTest:false}}}),[]);
});
