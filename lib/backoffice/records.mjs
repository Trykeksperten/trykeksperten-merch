import {db,transaction,audit} from './database.mjs';
import {createHash} from 'node:crypto';
import {validatedPFDeliveries} from '../pf-shipment.mjs';
import {checkoutPaymentProjection} from './checkout-payment.mjs';
const revision=Symbol('recordVersion');
const system={id:'system',companyId:'smerch'};
export function readRecord(namespace,id){const row=db().prepare('SELECT payload,version FROM records WHERE namespace=? AND id=?').get(namespace,id);if(!row){const error=Error('Data blev ikke fundet.');error.code='ENOENT';throw error;}const value=JSON.parse(row.payload);Object.defineProperty(value,revision,{value:row.version,writable:true});return value;}
export function listRecords(namespace){return db().prepare('SELECT id FROM records WHERE namespace=? ORDER BY updated_at DESC').all(namespace).map(r=>readRecord(namespace,r.id));}
function projectCheckout(value,{onlyIfChanged=false}={}){
 if(value.adminTest||value.adminLiveTest||value.paymentMode==='test')return;
 const connection=db(),existing=connection.prepare('SELECT * FROM orders WHERE id=?').get(value.id),customerId='customer-'+createHash('sha256').update(value.id).digest('hex').slice(0,24);
 const shipping=value.shipping||{},billing=value.billing||{},customer={...shipping,billing};
 connection.prepare('INSERT OR IGNORE INTO customers(id,company_id,name,email,data_json) VALUES(?,?,?,?,?)').run(customerId,'smerch',billing.company||shipping.company||shipping.name||'Oplysninger mangler',billing.email||shipping.email||'',JSON.stringify(customer));
 const projection=checkoutPaymentProjection(value),orderStatus=value.status==='cancelled'?'cancelled':projection.confirmed||existing?.order_status==='confirmed'?'confirmed':'pending_payment',payment=projection.status;
 if(existing){if(!onlyIfChanged||existing.order_status!==orderStatus||existing.payment_status!==payment||existing.paid_at!==projection.paidAt)connection.prepare('UPDATE orders SET order_status=?,payment_status=?,paid_at=?,version=version+1 WHERE id=?').run(orderStatus,payment,projection.paidAt,value.id);return;}
 const snapshot={...value,missingHistoricalDetails:!(value.lineSnapshots?.length)};
 connection.prepare('INSERT INTO orders(id,company_id,customer_id,source,source_id,order_status,payment_status,production_status,delivery_status,snapshot_json,created_at,paid_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(value.id,'smerch',customerId,'checkout',value.id,orderStatus,payment,'waiting','unshipped',JSON.stringify(snapshot),value.createdAt||new Date().toISOString(),projection.paidAt);
 for(const [i,line] of (value.lines||[]).entries()){
  if(!Number.isSafeInteger(line.quantity)||line.quantity<=0)throw Error('Historisk ordre har ugyldigt antal; migration kræver afstemning.');
  const old=value.lineSnapshots?.[i],q=value.quote?.lines?.[i];
  connection.prepare('INSERT INTO order_lines(id,order_id,position,sku,description,quantity,net_minor,vat_minor,snapshot_json) VALUES(?,?,?,?,?,?,?,?,?)').run(`${value.id}:${i}`,value.id,i,line.sku||'',old?.description||value.productNames?.[line.productId]||'',line.quantity,Number.isSafeInteger(q?.net)?q.net:null,Number.isSafeInteger(q?.vat)?q.vat:null,JSON.stringify(old||line));
 }
 audit(system,'order',value.id,'imported',{source:'checkout',historicalDetailsMissing:!value.lineSnapshots?.length});
}
export function saveRecord(namespace,id,value,{importOnly=false}={}){return transaction(()=>{const previous=db().prepare('SELECT version FROM records WHERE namespace=? AND id=?').get(namespace,id);if(previous&&importOnly)return readRecord(namespace,id);if(previous&&value[revision]!==previous.version)throw Error('Data er ændret samtidigt. Genindlæs og prøv igen.');const version=(previous?.version||0)+1;db().prepare('INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(namespace,id) DO UPDATE SET payload=excluded.payload,version=excluded.version,updated_at=excluded.updated_at').run(namespace,id,JSON.stringify(value),version,new Date().toISOString());if(namespace==='checkouts')projectCheckout(value);if(namespace==='orders')projectPF(value);if(Object.hasOwn(value,revision))value[revision]=version;else Object.defineProperty(value,revision,{value:version,writable:true});return value;});}

function projectPF(value,{onlyIfChanged=false}={}){
 if(!value.checkoutId||value.adminTest||value.gatewayPayload?.Header?.isTest)return;
 const connection=db(),order=connection.prepare('SELECT * FROM orders WHERE id=?').get(value.checkoutId);if(!order)return;
 const siblings=listRecords('orders').filter(p=>p.checkoutId===value.checkoutId&&!p.adminTest&&!p.gatewayPayload?.Header?.isTest);
 const checkout=readRecord('checkouts',value.checkoutId),lines=connection.prepare('SELECT id,sku,quantity FROM order_lines WHERE order_id=? ORDER BY position').all(checkout.id);
 // Rebuild only PF-owned projections, including rows created by the old complete-flag
 // implementation. Manual records and immutable document snapshots remain untouched.
 const previous=connection.prepare("SELECT * FROM shipments WHERE order_id=? AND created_by='system' AND id GLOB 'pf-ord-*' ORDER BY id").all(checkout.id);
 const oldLines=previous.flatMap(s=>connection.prepare('SELECT * FROM shipment_lines WHERE shipment_id=? ORDER BY order_line_id').all(s.id));
 for(const row of previous){connection.prepare('DELETE FROM shipment_lines WHERE shipment_id=?').run(row.id);connection.prepare('DELETE FROM shipments WHERE id=?').run(row.id);}
 const sent=new Map(lines.map(l=>[l.id,connection.prepare('SELECT coalesce(sum(quantity),0) n FROM shipment_lines WHERE order_line_id=?').get(l.id).n]));
 let needsReconciliation=false;const aggregateSources=[];
 for(const pf of siblings){
  const validated=validatedPFDeliveries(pf,checkout);if(validated.problems.length)needsReconciliation=true;
  // Validate this supplier's complete set before projecting any of its parcels.
  const totals=new Map();for(const d of validated.deliveries)for(const i of d.items){const id=checkout.id+':'+i.index;totals.set(id,(totals.get(id)||0)+i.quantity);}
  if([...totals].some(([id,n])=>{const line=lines.find(l=>l.id===id);return !line||!Number.isSafeInteger(n)||sent.get(id)+n>line.quantity;})){needsReconciliation=true;continue;}
  for(const delivery of validated.deliveries){
   const id='pf-'+pf.id+':'+delivery.key,tracking=delivery.trackingDetails?.[0];
   if(delivery.allocationScope)aggregateSources.push({shipmentId:id,allocationScope:delivery.allocationScope,sourceDeliveryKeys:delivery.sourceDeliveryKeys});
   connection.prepare('INSERT INTO shipments VALUES(?,?,?,?,?,?,?)').run(id,checkout.id,delivery.shipDate,delivery.carrier||null,tracking?.trackingURL||null,tracking?.trackingId||delivery.tracking?.[0]||null,'system');
   for(const item of delivery.items){const lineId=checkout.id+':'+item.index;connection.prepare('INSERT INTO shipment_lines VALUES(?,?,?)').run(id,lineId,item.quantity);sent.set(lineId,sent.get(lineId)+item.quantity);}
  }
 }
 const current=connection.prepare("SELECT * FROM shipments WHERE order_id=? AND created_by='system' AND id GLOB 'pf-ord-*' ORDER BY id").all(checkout.id),currentLines=current.flatMap(s=>connection.prepare('SELECT * FROM shipment_lines WHERE shipment_id=? ORDER BY order_line_id').all(s.id));
 const projectionChanged=JSON.stringify([previous,oldLines])!==JSON.stringify([current,currentLines]);
 if(projectionChanged)audit(system,'order',checkout.id,'pf_shipments_reconciled',{shipments:current.length,requiresReconciliation:needsReconciliation,...(aggregateSources.length?{aggregateSources}:{})});
 const complete=!needsReconciliation&&lines.length>0&&lines.every(l=>sent.get(l.id)===l.quantity),partial=lines.some(l=>sent.get(l.id)>0);
 const delivery=complete?'shipped':partial?'partial':'unshipped';
 const proofApproved=p=>p.proof?.decision?.decision==='approve'||p.decision?.decision==='approve'||!p.lines?.some(l=>l.decorations?.length);
 const expected=(checkout.pfOrderIds||[]),synced=expected.length>0&&siblings.length===expected.length&&siblings.every(p=>expected.includes(p.id));
 const production=complete?'completed':needsReconciliation?'waiting':synced&&siblings.every(p=>p.status==='processing'&&proofApproved(p))?'in_progress':synced&&siblings.every(proofApproved)?'ready':'waiting';
 if(!onlyIfChanged||projectionChanged||order.production_status!==production||order.delivery_status!==delivery)connection.prepare('UPDATE orders SET production_status=?,delivery_status=?,version=version+1 WHERE id=?').run(production,delivery,checkout.id);
}

// Startup repair for databases previously using ordered quantities as shipment evidence.
// The marker and all projections commit together, without rewriting source records.
export function reconcileStoredPFProjections(){return transaction(()=>{
 if(db().prepare("SELECT value FROM runtime_metadata WHERE key='pf_shipment_projection_v3'").get())return;
 const seen=new Set();for(const pf of listRecords('orders'))if(pf.checkoutId&&!seen.has(pf.checkoutId)&&!pf.adminTest&&!pf.gatewayPayload?.Header?.isTest){projectPF(pf,{onlyIfChanged:true});seen.add(pf.checkoutId);}
 db().prepare("INSERT OR IGNORE INTO runtime_metadata(key,value) VALUES('pf_shipment_projection_v2',?)").run(new Date().toISOString());
 db().prepare("INSERT INTO runtime_metadata(key,value) VALUES('pf_shipment_projection_v3',?)").run(new Date().toISOString());
});}

export function reconcileStoredCheckoutPayments(){return transaction(()=>{
 if(db().prepare("SELECT value FROM runtime_metadata WHERE key='checkout_payment_projection_v2'").get())return;
 for(const checkout of listRecords('checkouts'))projectCheckout(checkout,{onlyIfChanged:true});
 db().prepare("INSERT INTO runtime_metadata(key,value) VALUES('checkout_payment_projection_v2',?)").run(new Date().toISOString());
});}
