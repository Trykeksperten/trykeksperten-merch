import {db,transaction,audit} from './database.mjs';
import {createHash} from 'node:crypto';
const revision=Symbol('recordVersion');
const system={id:'system',companyId:'smerch'};
export function readRecord(namespace,id){const row=db().prepare('SELECT payload,version FROM records WHERE namespace=? AND id=?').get(namespace,id);if(!row){const error=Error('Data blev ikke fundet.');error.code='ENOENT';throw error;}const value=JSON.parse(row.payload);Object.defineProperty(value,revision,{value:row.version,writable:true});return value;}
export function listRecords(namespace){return db().prepare('SELECT id FROM records WHERE namespace=? ORDER BY updated_at DESC').all(namespace).map(r=>readRecord(namespace,r.id));}
function projectCheckout(value){
 if(value.adminTest||value.adminLiveTest||value.paymentMode==='test')return;
 const connection=db(),existing=connection.prepare('SELECT * FROM orders WHERE id=?').get(value.id),customerId='customer-'+createHash('sha256').update(value.id).digest('hex').slice(0,24);
 const shipping=value.shipping||{},billing=value.billing||{},customer={...shipping,billing};
 connection.prepare('INSERT OR IGNORE INTO customers(id,company_id,name,email,data_json) VALUES(?,?,?,?,?)').run(customerId,'smerch',billing.company||shipping.company||shipping.name||'Oplysninger mangler',billing.email||shipping.email||'',JSON.stringify(customer));
 const orderStatus=value.status==='cancelled'?'cancelled':['authorized','paid'].includes(value.status)?'confirmed':'pending_payment';
 const payment=value.status==='paid'&&value.paidAt?'paid':value.status==='authorized'?'reserved':value.status==='cancelled'?'cancelled':'unpaid';
 if(existing){connection.prepare('UPDATE orders SET order_status=?,payment_status=?,paid_at=?,version=version+1 WHERE id=?').run(orderStatus,payment,payment==='paid'?value.paidAt:null,value.id);return;}
 const snapshot={...value,missingHistoricalDetails:!(value.lineSnapshots?.length)};
 connection.prepare('INSERT INTO orders(id,company_id,customer_id,source,source_id,order_status,payment_status,production_status,delivery_status,snapshot_json,created_at,paid_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(value.id,'smerch',customerId,'checkout',value.id,orderStatus,payment,'waiting','unshipped',JSON.stringify(snapshot),value.createdAt||new Date().toISOString(),payment==='paid'?value.paidAt:null);
 for(const [i,line] of (value.lines||[]).entries()){
  if(!Number.isSafeInteger(line.quantity)||line.quantity<=0)throw Error('Historisk ordre har ugyldigt antal; migration kræver afstemning.');
  const old=value.lineSnapshots?.[i],q=value.quote?.lines?.[i];
  connection.prepare('INSERT INTO order_lines(id,order_id,position,sku,description,quantity,net_minor,vat_minor,snapshot_json) VALUES(?,?,?,?,?,?,?,?,?)').run(`${value.id}:${i}`,value.id,i,line.sku||'',old?.description||value.productNames?.[line.productId]||'',line.quantity,Number.isSafeInteger(q?.net)?q.net:null,Number.isSafeInteger(q?.vat)?q.vat:null,JSON.stringify(old||line));
 }
 audit(system,'order',value.id,'imported',{source:'checkout',historicalDetailsMissing:!value.lineSnapshots?.length});
}
export function saveRecord(namespace,id,value,{importOnly=false}={}){return transaction(()=>{const previous=db().prepare('SELECT version FROM records WHERE namespace=? AND id=?').get(namespace,id);if(previous&&importOnly)return readRecord(namespace,id);if(previous&&value[revision]!==previous.version)throw Error('Data er ændret samtidigt. Genindlæs og prøv igen.');const version=(previous?.version||0)+1;db().prepare('INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(namespace,id) DO UPDATE SET payload=excluded.payload,version=excluded.version,updated_at=excluded.updated_at').run(namespace,id,JSON.stringify(value),version,new Date().toISOString());if(namespace==='checkouts')projectCheckout(value);if(namespace==='orders')projectPF(value);if(Object.hasOwn(value,revision))value[revision]=version;else Object.defineProperty(value,revision,{value:version,writable:true});return value;});}

function projectPF(value){
 if(!value.checkoutId||value.adminTest||value.gatewayPayload?.Header?.isTest)return;
 const order=db().prepare('SELECT * FROM orders WHERE id=?').get(value.checkoutId);if(!order)return;
 const siblings=listRecords('orders').filter(p=>p.checkoutId===value.checkoutId&&!p.adminTest&&!p.gatewayPayload?.Header?.isTest);
 const checkout=readRecord('checkouts',value.checkoutId);
 const received=siblings.filter(p=>p.shipment?.isOrderComplete===true&&p.shipment.shipDate);
 for(const p of received){const shipmentId='pf-'+p.id;if(db().prepare('SELECT id FROM shipments WHERE id=?').get(shipmentId))continue;const indexes=checkout.fulfillment?.groups?.[p.checkoutGroupIndex]?.lineIndexes;let mapped=[];
 if(Array.isArray(indexes)&&indexes.length===p.lines.length)mapped=indexes.map((index,i)=>({id:checkout.id+':'+index,quantity:p.lines[i].quantity,sku:p.lines[i].sku}));
 else {const used=new Set();for(const l of p.lines){const matches=(checkout.lines||[]).map((x,i)=>({x,i})).filter(({x,i})=>!used.has(i)&&x.sku===l.sku&&x.quantity===l.quantity);if(matches.length!==1){mapped=[];break;}used.add(matches[0].i);mapped.push({id:checkout.id+':'+matches[0].i,quantity:l.quantity,sku:l.sku});}}
 if(!mapped.length||mapped.some(l=>{const row=db().prepare('SELECT quantity,sku FROM order_lines WHERE id=?').get(l.id),sent=db().prepare('SELECT coalesce(sum(quantity),0) n FROM shipment_lines WHERE order_line_id=?').get(l.id).n;return !row||row.sku!==l.sku||sent+l.quantity>row.quantity;}))continue;
 const tracking=p.shipment.trackingDetails?.[0];db().prepare('INSERT INTO shipments VALUES(?,?,?,?,?,?,?)').run(shipmentId,checkout.id,p.shipment.shipDate,p.shipment.carrier||null,tracking?.trackingURL||null,tracking?.trackingId||p.shipment.tracking?.[0]||null,'system');for(const l of mapped)db().prepare('INSERT INTO shipment_lines VALUES(?,?,?)').run(shipmentId,l.id,l.quantity);audit(system,'order',checkout.id,'pf_shipment_imported',{pfOrderId:p.id});
 }
 const lines=db().prepare('SELECT id,quantity FROM order_lines WHERE order_id=?').all(checkout.id),complete=lines.length&&lines.every(l=>db().prepare('SELECT coalesce(sum(quantity),0) n FROM shipment_lines WHERE order_line_id=?').get(l.id).n===l.quantity),partial=siblings.some(p=>['partially_shipped','shipped'].includes(p.status)||p.shipment?.shipDate);
 const delivery=complete?'shipped':partial?'partial':'unshipped';
 const proofApproved=p=>p.proof?.decision?.decision==='approve'||p.decision?.decision==='approve'||!p.lines?.some(l=>l.decorations?.length);
 const expected=(checkout.pfOrderIds||[]).length,synced=expected>0&&siblings.length===expected;
 const production=complete?'completed':synced&&siblings.every(p=>p.status==='processing'&&proofApproved(p))?'in_progress':synced&&siblings.every(proofApproved)?'ready':'waiting';
 db().prepare('UPDATE orders SET production_status=?,delivery_status=?,version=version+1 WHERE id=?').run(production,delivery,checkout.id);
}
