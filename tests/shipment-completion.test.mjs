import test from 'node:test';
import assert from 'node:assert/strict';
import {nextStep} from '../dist/admin-order-state.mjs';
import {loadAdminOrderQueue,queueCounts} from '../dist/admin-work-queue.mjs';
const delivery={key:'parcel-1',trackingDetails:[{trackingId:'123',trackingURL:'https://carrier.test/123'}]};
const order={id:'o1',checkoutId:'c1',status:'shipped',lines:[],shipment:{deliveries:[delivery],trackingDetails:delivery.trackingDetails}};
const paid={id:'c1',status:'paid'};
const sent=[{orderId:'o1',deliveryKey:'parcel-1',status:'sent'}];
test('shipment remains actionable until payment and every delivery mail are complete',()=>{
 assert.equal(nextStep(order,paid,sent)[0],'Smerchs opgaver udført');
 assert.equal(queueCounts([order],[paid],sent).overview,0);
 assert.equal(nextStep({...order,deliveryConfirmation:{at:'2026-10-30T12:00:00Z'}},paid,sent)[0],'Afsluttet');
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
 assert.equal(nextStep(current,stale,[{...sent[0],status:'failed'}])[0],'Smerchs opgaver udført');
 const counts=queueCounts([current],[stale],[{...sent[0],status:'failed'}]);
 assert.equal(counts.overview,0);assert.equal(counts.blocked,0);assert.equal(counts.deliveries,1);
 current.attention.shipments=[{...sent[0],id:'mail',status:'uncertain'}];
 assert.equal(queueCounts([current],[stale],sent).overview,1);assert.equal(queueCounts([current],[stale],sent).blocked,1);
});

test('the shared admin queue loads attention for all orders and retains actual mail failures',async()=>{
 const second={...order,id:'o2',checkoutId:'c2',deliveryConfirmation:{at:'2026-10-30T12:00:00Z'}};
 const secondMail={...sent[0],orderId:second.id,id:'mail-2'};
 const routes=new Map([
  ['/api/pf-orders',[order,second]],
  ['/api/admin/checkouts',[paid,{...paid,id:second.checkoutId}]],
  ['/api/pf-orders/automation-settings',{shipments:[...sent,secondMail]}]
 ]);
 for(const [row,mail] of [[order,sent[0]],[second,secondMail]]){
  const base='/api/pf-orders/'+row.id;
  routes.set(base+'/automation',{shipments:[mail],shipmentMailAutomatic:true});
  routes.set(base+'/finance',{summary:{problems:[]},accountingPurpose:'reconciliation'});
  routes.set(base+'/documents',{documents:[]});
  routes.set(base+'/correspondence',[]);
 }
 const api=async path=>{
  assert.ok(routes.has(path),path);
  return {json:async()=>structuredClone(routes.get(path))};
 };
 const counts=async()=>{
  const {orders,checkouts,shipmentMails}=await loadAdminOrderQueue(api);
  return queueCounts(orders,checkouts,shipmentMails);
 };
 assert.deepEqual(await counts(),{overview:0,orders:2,proofs:0,production:0,deliveries:1,blocked:0});
 secondMail.status='failed';
 assert.deepEqual(await counts(),{overview:1,orders:2,proofs:0,production:0,deliveries:1,blocked:1});
});
