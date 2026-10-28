import test from 'node:test';
import assert from 'node:assert/strict';
import {nextStep} from '../dist/admin-order-state.mjs';
import {queueCounts} from '../dist/admin-work-queue.mjs';
const delivery={key:'parcel-1',trackingDetails:[{trackingId:'123',trackingURL:'https://carrier.test/123'}]};
const order={id:'o1',checkoutId:'c1',status:'shipped',lines:[],shipment:{deliveries:[delivery],trackingDetails:delivery.trackingDetails}};
const paid={id:'c1',status:'paid'};
const sent=[{orderId:'o1',deliveryKey:'parcel-1',status:'sent'}];
test('shipment remains actionable until payment and every delivery mail are complete',()=>{
 assert.equal(nextStep(order,paid,sent)[0],'Afsluttet');
 assert.equal(queueCounts([order],[paid],sent).overview,0);
 const reserved={...paid,status:'authorized'};
 assert.match(nextStep(order,reserved,sent)[1],/Hæv betalingen/);
 assert.equal(queueCounts([order],[reserved],sent).overview,1);
 for(const status of ['review','failed','uncertain','sending']){
  const mails=[{...sent[0],status}];
  assert.equal(nextStep(order,paid,mails)[0],'Smerch');
  assert.equal(queueCounts([order],[paid],mails).overview,1);
 }
 assert.equal(nextStep(order,paid,[])[0],'Smerch');
 assert.equal(nextStep(order,undefined,sent)[0],'Smerch');
 assert.equal(nextStep({...order,shipment:{deliveries:[delivery,{...delivery,key:'parcel-2'}]}},paid,sent)[0],'Smerch');
 assert.equal(nextStep(order,paid,[{...sent[0],orderId:'different'}])[0],'Smerch');
 assert.equal(nextStep({...order,shipment:{deliveries:[{...delivery,trackingDetails:[]}]}},paid,sent)[0],'Smerch');
 assert.equal(nextStep({...order,status:'partially_shipped'},paid,sent)[0],'PF');
});

test('fresh order mail and finance state clears all counters despite stale global queues',()=>{
 const current={...order,attention:{shipments:sent,finance:{summary:{problems:[]},shipments:[{key:'parcel-1',invoiceStatus:'issued'}],mail:[]}}};
 const stale={...paid,finance:{problems:['Faktura afventer.']}};
 assert.equal(nextStep(current,stale,[{...sent[0],status:'failed'}])[0],'Afsluttet');
 const counts=queueCounts([current],[stale],[{...sent[0],status:'failed'}]);
 assert.equal(counts.overview,0);assert.equal(counts.blocked,0);assert.equal(counts.deliveries,1);
 current.attention.shipments=[{...sent[0],id:'mail',status:'uncertain'}];
 assert.equal(queueCounts([current],[stale],sent).overview,1);assert.equal(queueCounts([current],[stale],sent).blocked,1);
});
