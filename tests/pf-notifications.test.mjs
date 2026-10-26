import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {dataPath} from '../lib/data-path.mjs';
import {applyPFNotification,applyPFNotificationBatch,readOrder} from '../lib/pf-orders.mjs';
import {checkoutReadyForCapture} from '../lib/order-flow.mjs';
async function fixture(run){
 const orders=Array.from({length:2},()=>{const uuid=randomUUID();return {id:`ord-${uuid}`,checkoutId:`pay-${randomUUID()}`,purchaseOrderNumber:`SMERCH-${uuid}`,pfOrderNumber:1234,status:'confirmed',lines:[{sku:'TEST',quantity:2,decorations:[]}],events:[]};});
 await mkdir(dataPath('orders'),{recursive:true});
 for(const order of orders)await writeFile(dataPath('orders',order.id+'.json'),JSON.stringify(order));
 try{await run(orders);}finally{for(const order of orders)await rm(dataPath('orders',order.id+'.json'),{force:true});}
}
const delivery=(order,complete,tracking)=>({deliveryLocation:{customerPONumber:order.purchaseOrderNumber,carrier:'UPS',shipDate:'2026-01-01T00:00:00.000Z',...(complete===undefined?{}:{isOrderComplete:complete}),trackAndTrace:[{trackingId:tracking,trackingURL:'https://example.invalid/track'}]}});
test('Thomas confirmation POreference and legacy reference resolve without changing prices',()=>fixture(async([order])=>{
 const result=await applyPFNotification('confirmation',{messageId:'confirmation',POreference:order.purchaseOrderNumber,delivery:{reference:order.purchaseOrderNumber},orderNumber:7862891,totalAmount:0.01,currency:'EUR'});
 assert.equal(result.pfOrderNumber,7862891);assert.equal(result.totalAmount,undefined);assert.equal(result.currency,undefined);
 await assert.rejects(applyPFNotification('confirmation',{messageId:'conflict',POreference:order.purchaseOrderNumber,reference:`SMERCH-${randomUUID()}`,orderNumber:1}),/modstridende/);
}));
test('ASN handles every order and every delivery, retries are idempotent and partial cannot capture',()=>fixture(async([a,b])=>{
 const notice={ShipmentNotification:{messageId:'asn-example',deliveries:[delivery(a,false,'A1'),delivery(b,true,'B1'),delivery(a,undefined,'A2')]}};
 const rows=await applyPFNotificationBatch('shipment',notice);
 assert.equal(rows.length,2);assert.equal(rows[0].status,'partially_shipped');assert.deepEqual(rows[0].shipment.tracking,['A1','A2']);assert.equal(rows[1].status,'shipped');
 const checkout={id:a.checkoutId,lines:a.lines,pfOrderIds:[a.id],fulfillment:{groups:[{}]}};
 assert.equal(await checkoutReadyForCapture(checkout),false);
 await applyPFNotificationBatch('shipment',notice);
 assert.equal((await readOrder(a.id)).shipment.deliveries.length,2);
 const complete=await applyPFNotification('shipment',{ShipmentNotification:{messageId:'final-asn',deliveries:[delivery(a,true,'A3')]}});
 assert.equal(complete.status,'shipped');assert.deepEqual(complete.shipment.tracking,['A1','A2','A3']);assert.equal(await checkoutReadyForCapture(checkout),true);
 await applyPFNotification('status',{StatusChangedNotification:{messageId:'late-processing',poNumber:a.purchaseOrderNumber,statusCode:'PROCESSING',expectedShipDate:'2026-01-01T00:00:00.000Z'}});
 assert.equal((await readOrder(a.id)).status,'shipped');
}));
test('unknown order in ASN rejects before storing known deliveries',()=>fixture(async([a,b])=>{
 b.purchaseOrderNumber=`SMERCH-${randomUUID()}`;
 await assert.rejects(applyPFNotificationBatch('shipment',{ShipmentNotification:{messageId:'unknown-order',deliveries:[delivery(a,true,'A'),delivery(b,true,'B')]}}));
 assert.equal((await readOrder(a.id)).shipment,undefined);
}));
test('PF processing and shipment cannot bypass missing proof approval',()=>fixture(async([a])=>{
 a.lines[0].decorations=[{optionId:'front'}];a.status='processing';
 await writeFile(dataPath('orders',a.id+'.json'),JSON.stringify(a));
 const result=await applyPFNotification('shipment',{ShipmentNotification:{messageId:'unapproved',deliveries:[delivery(a,true,'A')]}});
 assert.equal(result.status,'needs_attention');
}));
test('hourly status notices update receipt time without duplicate history; real changes are kept',()=>fixture(async([a])=>{
 const notice=(messageId,changes={})=>({StatusChangedNotification:{messageId,poNumber:a.purchaseOrderNumber,statusCode:'PROCESSING',statusInformation:'In production',expectedShipDate:'2026-10-29T00:00:00.000Z',...changes}});
 const first=await applyPFNotification('status',notice('hour-1'));
 assert.equal(first.events.length,1);assert.equal(first.events[0].expectedShipDate,'2026-10-29T00:00:00.000Z');
 // A stale receipt timestamp makes the refresh assertion independent of clock resolution.
 first.pfStatusReceivedAt='2026-01-01T00:00:00.000Z';await writeFile(dataPath('orders',a.id+'.json'),JSON.stringify(first));
 const repeat=await applyPFNotification('status',notice('hour-2',{expectedShipDate:'2026-10-29T00:00:00Z'}));
 assert.equal(repeat.events.length,1);assert.notEqual(repeat.pfStatusReceivedAt,first.pfStatusReceivedAt);
 assert.equal(repeat.shipment,undefined);
 const dateChange=await applyPFNotification('status',notice('date-change',{expectedShipDate:'2026-10-30'}));
 assert.equal(dateChange.events.length,2);assert.equal(dateChange.expectedShipDate,'2026-10-30');
 // Replaying a previously suppressed message must not revert a newer date.
 const retry=await applyPFNotification('status',notice('hour-2'));
 assert.deepEqual(retry,dateChange);
 const infoChange=await applyPFNotification('status',notice('info-change',{expectedShipDate:'2026-10-30',statusInformation:'Waiting for stock'}));
 assert.equal(infoChange.events.length,3);
 const statusChange=await applyPFNotification('status',notice('stalled',{expectedShipDate:'2026-10-30',statusCode:'STALLED',statusInformation:'Waiting for stock'}));
 assert.equal(statusChange.events.length,4);assert.equal(statusChange.status,'needs_attention');
}));
test('identical supplier status still enforces changed local proof approval guards',()=>fixture(async([a])=>{
 const body={poNumber:a.purchaseOrderNumber,statusCode:'PROCESSING'};
 const first=await applyPFNotification('status',{StatusChangedNotification:{...body,messageId:'before-proof'}});
 first.lines[0].decorations=[{optionId:'front'}];await writeFile(dataPath('orders',a.id+'.json'),JSON.stringify(first));
 const next=await applyPFNotification('status',{StatusChangedNotification:{...body,messageId:'after-proof'}});
 assert.equal(next.status,'needs_attention');assert.equal(next.events.length,2);
}));
