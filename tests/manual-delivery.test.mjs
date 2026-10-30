import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {confirmOrderDelivery,revokeOrderDelivery,readOrder,applyPFNotification} from '../lib/pf-orders.mjs';
import {workQueue} from '../dist/admin-work-queue.mjs';
import {orderStatusLabel,shipmentNextStep} from '../dist/admin-order-state.mjs';
test('manual delivery persists once, survives PF updates and leaves payment tasks intact',async()=>{
 const old=process.env.SMERCH_DATA_DIR,dir=await mkdtemp(join(tmpdir(),'smerch-delivery-'));process.env.SMERCH_DATA_DIR=dir;
 const uuid='11111111-1111-4111-8111-111111111111',id='ord-'+uuid;
 try{
 await mkdir(join(dir,'orders'));
 const order={id,status:'shipped',lines:[],events:[],shipment:{isOrderComplete:true,deliveries:[],trackingDetails:[]}};
 await writeFile(join(dir,'orders',id+'.json'),JSON.stringify(order));
 assert.equal(workQueue([order],[])[0].bucket,'deliveries');
 const actor={type:'staff',name:'Testmedarbejder'};
 const confirmed=await confirmOrderDelivery(id,actor);
 assert.equal(confirmed.status,'shipped');assert.deepEqual(confirmed.deliveryConfirmation.performedBy,actor);
 assert.equal(orderStatusLabel(confirmed),'Leveret');assert.equal(workQueue([confirmed],[])[0].bucket,'orders');
 assert.match(shipmentNextStep(confirmed,{status:'authorized'})[1],/Hæv betalingen/);
 await confirmOrderDelivery(id,actor);
 assert.equal((await readOrder(id)).events.filter(e=>e.type==='delivery_confirmed').length,1);
 await applyPFNotification('status',{StatusChangedNotification:{poNumber:'SMERCH-'+uuid,messageId:'after-delivery',statusCode:'PROCESSING'}});
 assert.deepEqual((await readOrder(id)).deliveryConfirmation,confirmed.deliveryConfirmation);
 const restored=await revokeOrderDelivery(id,actor);
 assert.equal(restored.deliveryConfirmation,undefined);
 assert.equal(restored.status,'shipped');
 assert.deepEqual(restored.shipment,confirmed.shipment);
 assert.equal(orderStatusLabel(restored),'Afsendt');
 assert.equal(workQueue([restored],[])[0].bucket,'deliveries');
 assert.deepEqual(restored.events.at(-1).previousConfirmation,confirmed.deliveryConfirmation);
 assert.deepEqual(restored.events.at(-1).performedBy,actor);
 await revokeOrderDelivery(id,actor);
 assert.equal((await readOrder(id)).events.filter(e=>e.type==='delivery_confirmation_revoked').length,1);
 assert.ok((await confirmOrderDelivery(id,actor)).deliveryConfirmation);

 for(const status of ['processing','partially_shipped']){
 await writeFile(join(dir,'orders',id+'.json'),JSON.stringify({...order,status}));
 await assert.rejects(()=>confirmOrderDelivery(id,actor),/fuldt afsendt/);
 }
 }finally{if(old===undefined)delete process.env.SMERCH_DATA_DIR;else process.env.SMERCH_DATA_DIR=old;await rm(dir,{recursive:true,force:true});}
});
