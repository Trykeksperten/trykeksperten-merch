import test from 'node:test';
import assert from 'node:assert/strict';
import {pfStatusRows} from '../dist/admin-pf-status.mjs';
test('planned dispatch remains separate from actual shipment',()=>{
 const order={status:'approval_recorded',pfStatus:'PROCESSING',expectedShipDate:'2026-10-29T00:00:00.000Z',events:[{type:'pf_status',at:'2026-10-23T13:05:37.585Z'},{type:'proof',at:'2026-10-26T10:00:00Z'}]};
 const before=structuredClone(order),rows=Object.fromEntries(pfStatusRows(order));
 assert.equal(rows['Forventet afsendelse'],'29.10.2026');assert.match(rows['Seneste PF-status modtaget'],/23.10.2026/);assert.equal(rows['PF-status'],'PROCESSING');assert.deepEqual(order,before);assert.equal(order.shipment,undefined);
});
test('absent or invalid supplier date is explicit; latest status receipt is used',()=>{
 assert.equal(Object.fromEntries(pfStatusRows({expectedShipDate:'invalid'}))['Forventet afsendelse'],'Ikke modtaget fra PF');
 assert.match(Object.fromEntries(pfStatusRows({events:[{type:'pf_status',at:'2026-10-26T09:00:00Z'},{type:'pf_status',at:'2026-10-23T10:00:00Z'}]}))['Seneste PF-status modtaget'],/26.10.2026/);
});
test('latest receipt remains visible when unchanged PF notices do not add history',()=>{
 const rows=Object.fromEntries(pfStatusRows({pfStatusReceivedAt:'2026-10-26T21:20:00Z',events:[{type:'pf_status',at:'2026-10-26T13:20:00Z'}]}));
 assert.match(rows['Seneste PF-status modtaget'],/22[.:]20/);
});
test('unchanged receipts are explained while actual changes keep their own timestamp',()=>{
 const event={type:'pf_status',at:'2026-10-26T21:20:00Z'};
 const value=order=>Object.fromEntries(pfStatusRows(order))['Seneste PF-status modtaget'];
 assert.match(value({pfStatusReceivedAt:'2026-10-27T06:20:00Z',events:[event]}),/07[.:]20.*Ingen ændringer/);
 assert.doesNotMatch(value({pfStatusReceivedAt:event.at,events:[event]}),/Ingen ændringer/);
 assert.doesNotMatch(value({events:[event]}),/Ingen ændringer/);
 assert.doesNotMatch(value({pfStatusReceivedAt:event.at,events:[]}),/Ingen ændringer/);
});
test('PF message text is visible even when the order is processing',()=>{
 const rows=Object.fromEntries(pfStatusRows({status:'processing',pfStatusInformation:'Expected dispatch confirmed'}));
 assert.equal(rows['Besked fra PF'],'Expected dispatch confirmed');
 assert.equal(Object.fromEntries(pfStatusRows({pfStatusInformation:' '}))['Besked fra PF'],undefined);
});
