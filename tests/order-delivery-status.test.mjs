import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryStatusRows,publicPFDelivery} from '../dist/order-delivery-status.mjs';
import {renderShipmentTracking} from '../dist/shipment-tracking.mjs';
test('planning date is public without claiming production or shipment, and private data stays private',()=>{
 const order={status:'processing',expectedShipDate:'2026-10-29T00:00:00Z',shipping:{email:'private@example.test'},events:[{internal:'secret'}],pfStatusInformation:'internal'};
 const view=publicPFDelivery(order),rows=deliveryStatusRows(view);
 assert.equal(Object.fromEntries(rows)['Forventet afsendelse'],'29.10.2026');
 assert.match(rows[0][1],/PF behandler/);assert.doesNotMatch(JSON.stringify(rows),/Under produktion/);
 assert.equal(view.shipping,undefined);assert.equal(view.events,undefined);assert.equal(view.pfStatusInformation,undefined);
 assert.match(Object.fromEntries(rows).Tracking,/når ordren er afsendt/);
 assert.equal(deliveryStatusRows({status:'processing',expectedShipDate:'invalid'}).length,2);
 for(const status of ['cancelled','needs_attention','shipped','partially_shipped'])assert.deepEqual(deliveryStatusRows({status,expectedShipDate:order.expectedShipDate}),[]);
});
test('customer tracking switches from planning to carrier link without retaining a pending message',()=>{
 const original=globalThis.document;
 const node=tag=>({tag,children:[],textContent:'',append(child){this.children.push(child);},replaceChildren(){this.children=[];}});
 globalThis.document={createElement:node};
 try{
  const container=node('div');renderShipmentTracking(container,[{status:'processing',expectedShipDate:'2026-10-29'}]);
  assert.match(JSON.stringify(container),/29.10.2026/);
  renderShipmentTracking(container,[{status:'shipped',carrier:'UPS',trackingDetails:[{trackingId:'DEMO123',trackingURL:'https://www.ups.com/track?tracknum=DEMO123'}]}]);
  assert.doesNotMatch(JSON.stringify(container),/Tracking kommer|Forventet afsendelse/);
  const link=container.children[0].children[1].children[0];assert.equal(link.href,'https://www.ups.com/track?tracknum=DEMO123');assert.match(link.textContent,/DEMO123/);
  renderShipmentTracking(container,[{status:'shipped',trackingDetails:[{trackingId:'SAFE',trackingURL:'javascript:alert(1)'}]}]);
  assert.equal(container.children[0].children[1].children.length,0);
 }finally{globalThis.document=original;}
});
