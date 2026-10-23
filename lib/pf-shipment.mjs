import {createHash} from 'node:crypto';
import {trackingEntries} from '../dist/shipment-tracking.mjs';
// Gateway v2.2.2 pp.30–34. Preserve documented delivery items; never infer partial quantities.
export function shipmentRecord(delivery){
 const containers=Array.isArray(delivery.item)?delivery.item:[];
 const items=containers.flatMap(row=>Array.isArray(row.deliveryLocationItem)?row.deliveryLocationItem:row.deliveryLocationItem?[row.deliveryLocationItem]:[row]).map(row=>({sku:String(row.sku||row.SKU||''),quantity:Number(row.quantity)}));
 const tracking=trackingEntries(delivery.trackAndTrace).sort((a,b)=>a.trackingId.localeCompare(b.trackingId));
 const row={carrier:String(delivery.carrier||'').slice(0,200),shipDate:delivery.shipDate,tracking:tracking.map(t=>t.trackingId),trackingDetails:tracking,isOrderComplete:delivery.isOrderComplete===true,reference:typeof delivery.reference==='object'&&delivery.reference?{shipmentID:String(delivery.reference.shipmentID||''),pickTicket:String(delivery.reference.pickTicket||'')}:typeof delivery.reference==='string'?delivery.reference.slice(0,500):null,items};
 if(row.reference&&typeof row.reference==='object'&&!row.reference.shipmentID&&!row.reference.pickTicket)row.reference=null;
 row.key=createHash('sha256').update(JSON.stringify(row.reference?{reference:typeof row.reference==='object'?(row.reference.shipmentID||row.reference.pickTicket):row.reference}:row.tracking.length?{carrier:row.carrier.toUpperCase(),tracking:row.tracking}:{carrier:row.carrier.toUpperCase(),shipDate:row.shipDate,items:[...items].sort((a,b)=>a.sku.localeCompare(b.sku))})).digest('hex');return row;
}
export function mergeShipments(previous,records){
 const byKey=new Map();
 for(const row of [...previous,...records]){
  const key=row.key||shipmentRecord({...row,trackAndTrace:row.trackingDetails||row.tracking}).key,old=byKey.get(key);
  const tracking=new Map((old?.trackingDetails||[]).map(t=>[t.trackingId,t]));
  for(const t of row.trackingDetails||[]){const prior=tracking.get(t.trackingId);tracking.set(t.trackingId,{...prior,...t,trackingURL:t.trackingURL||prior?.trackingURL||null});}
  byKey.set(key,{...old,...row,key,carrier:row.carrier||old?.carrier||'',shipDate:Number.isFinite(Date.parse(row.shipDate))?row.shipDate:old?.shipDate||row.shipDate,items:row.items?.length?row.items:old?.items||[],trackingDetails:[...tracking.values()],tracking:[...new Set([...(old?.tracking||[]),...(row.tracking||[])])],isOrderComplete:old?.isOrderComplete===true||row.isOrderComplete===true});
 }
 return [...byKey.values()];
}

export function shipmentProblems(order,delivery){const missing=[...(order.shipment?.issues||[])];if(['cancelled','needs_attention'].includes(order.status))missing.push('Ordren kræver afklaring før kundemail.');if(!Number.isFinite(Date.parse(delivery.shipDate)))missing.push('Gyldig afsendelsesdato mangler.');if(!delivery.carrier)missing.push('Transportør mangler.');if(!delivery.trackingDetails?.some(t=>t.trackingId&&t.trackingURL))missing.push('Gyldigt trackingnummer og trackinglink mangler.');if(delivery.items?.some(i=>!i.sku||!Number.isSafeInteger(i.quantity)||i.quantity<=0||!order.lines?.some(l=>l.sku===i.sku&&i.quantity<=l.quantity)))missing.push('Afsendte vareantal skal afstemmes.');return missing;}
export function shipmentQuantityProblems(order,deliveries){
 const ordered=new Map(),sent=new Map();for(const l of order.lines||[])ordered.set(l.sku,(ordered.get(l.sku)||0)+l.quantity);
 const issues=[];for(const d of deliveries)for(const i of d.items||[]){if(!ordered.has(i.sku)||!Number.isSafeInteger(i.quantity)||i.quantity<=0){issues.push('PF har sendt ukendte varer eller ugyldige antal.');continue;}sent.set(i.sku,(sent.get(i.sku)||0)+i.quantity);}
 for(const [sku,n] of sent)if(n>ordered.get(sku))issues.push('PF’s afsendte antal overstiger ordren: '+sku);
 if(deliveries.some(d=>d.isOrderComplete)&&deliveries.every(d=>d.items?.length))for(const [sku,n] of ordered)if(sent.get(sku)!==n)issues.push('PF melder komplet levering, men vareantal stemmer ikke: '+sku);
 return [...new Set(issues)];
}
