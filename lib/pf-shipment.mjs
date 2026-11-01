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
const referenceKey=ref=>typeof ref==='object'&&ref?(ref.shipmentID||ref.pickTicket):ref;
export function mergeShipments(previous,records){
 const byKey=new Map();
 for(const row of [...previous,...records]){
  let key=row.key||shipmentRecord({...row,trackAndTrace:row.trackingDetails||row.tracking}).key;
  // PF may add its shipment reference later. Match a single existing parcel conservatively.
  if(!byKey.has(key)){
   const matches=[...byKey.values()].filter(old=>(referenceKey(old.reference)&&referenceKey(old.reference)===referenceKey(row.reference))||((!old.reference||!row.reference)&&old.carrier===row.carrier&&((old.tracking||[]).some(id=>(row.tracking||[]).includes(id))||(old.shipDate===row.shipDate&&old.items?.length&&JSON.stringify([...old.items].sort((a,b)=>a.sku.localeCompare(b.sku)))===JSON.stringify([...(row.items||[])].sort((a,b)=>a.sku.localeCompare(b.sku)))))));
   if(matches.length===1)key=matches[0].key;
  }
  const old=byKey.get(key);
  const tracking=new Map((old?.trackingDetails||[]).map(t=>[t.trackingId,t]));
  for(const t of row.trackingDetails||[]){const prior=tracking.get(t.trackingId);tracking.set(t.trackingId,{...prior,...t,trackingURL:t.trackingURL||prior?.trackingURL||null});}
  byKey.set(key,{...old,...row,key,carrier:row.carrier||old?.carrier||'',shipDate:Number.isFinite(Date.parse(row.shipDate))?row.shipDate:old?.shipDate||row.shipDate,items:row.items?.length?row.items:old?.items||[],trackingDetails:[...tracking.values()],tracking:[...new Set([...(old?.tracking||[]),...(row.tracking||[])])],isOrderComplete:old?.isOrderComplete===true||row.isOrderComplete===true});
 }
 return [...byKey.values()];
}

const cancelledOrder=order=>Boolean(order.pfCancellation)||order.status==='cancelled'||order.pfStatus==='CANCELLED'||order.events?.some(e=>e.type==='pf_status'&&e.pfStatus==='CANCELLED');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])])):value;
const fingerprint=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
// Supplier enrichment is not part of the customer's immutable design selection.
const originalLine=line=>({productId:line.productId,sku:line.sku,quantity:line.quantity,decorations:(line.decorations||[]).map(({files,pmsColors,...design})=>design)});
const repeatedSKU=lines=>new Set(lines.map(l=>l.sku)).size!==lines.length;
function skuQuantities(items){const totals=new Map();for(const item of items)totals.set(item.sku,(totals.get(item.sku)||0)+item.quantity);return [...totals].sort(([a],[b])=>String(a).localeCompare(String(b))).map(([sku,quantity])=>({sku,quantity}));}

export function shipmentProblems(order,delivery){
 const missing=[...(order.shipment?.issues||[])];
 if(cancelledOrder(order)||order.status==='needs_attention')missing.push('Ordren kræver afklaring før kundemail.');
 if(!Number.isFinite(Date.parse(delivery.shipDate))||Date.parse(delivery.shipDate)>Date.now())missing.push('Gyldig afsendelsesdato mangler.');
 if(!delivery.items?.length)missing.push('Afsendte vareantal mangler.');
 if(!delivery.carrier)missing.push('Transportør mangler.');
 if(!delivery.trackingDetails?.some(t=>t.trackingId&&t.trackingURL))missing.push('Gyldigt trackingnummer og trackinglink mangler.');
 const ordered=new Map(skuQuantities(order.lines||[]).map(i=>[i.sku,i.quantity])),items=delivery.items||[];
 if(items.some(i=>!i.sku||!Number.isSafeInteger(i.quantity)||i.quantity<=0)||skuQuantities(items).some(i=>!Number.isSafeInteger(i.quantity)||!Number.isSafeInteger(ordered.get(i.sku))||i.quantity>ordered.get(i.sku)))missing.push('Afsendte vareantal skal afstemmes.');
 return [...new Set(missing)];
}
export function shipmentQuantityProblems(order,deliveries){
 const ordered=new Map(),sent=new Map();for(const l of order.lines||[])ordered.set(l.sku,(ordered.get(l.sku)||0)+l.quantity);
 const issues=[];for(const d of deliveries)for(const i of d.items||[]){if(!ordered.has(i.sku)||!Number.isSafeInteger(i.quantity)||i.quantity<=0){issues.push('PF har sendt ukendte varer eller ugyldige antal.');continue;}sent.set(i.sku,(sent.get(i.sku)||0)+i.quantity);}
 for(const [sku,n] of sent)if(!Number.isSafeInteger(n)||n>ordered.get(sku))issues.push('PF’s afsendte antal overstiger ordren: '+sku);
 if(deliveries.some(d=>d.isOrderComplete===true)&&deliveries.every(d=>d.items?.length))for(const [sku,n] of ordered)if(sent.get(sku)!==n)issues.push('PF melder komplet levering, men vareantal stemmer ikke: '+sku);
 return [...new Set(issues)];
}

// PF ASN identifies SKUs, not design rows. For repeated SKUs only a complete,
// exactly reconciled supplier order establishes all original line quantities.
// This logical allocation never attributes a design to an individual parcel.
export function validatedPFOrderDeliveries(order,{now=Date.now()}={}){
 const history=Array.isArray(order.shipment?.deliveries)?order.shipment.deliveries:[],lines=Array.isArray(order.lines)?order.lines:[],problems=[...(order.shipment?.issues||[])];
 if(cancelledOrder(order)||order.status==='needs_attention')problems.push('PF-ordren kræver afklaring før afsendte antal kan bruges.');
 if(!history.length){if(order.shipment?.shipDate||order.shipment?.isOrderComplete)problems.push('Afsendte vareantal mangler.');return {deliveries:[],problems:[...new Set(problems)]};}
 if(!lines.length||lines.some(l=>!l.sku||!Number.isSafeInteger(l.quantity)||l.quantity<=0)||skuQuantities(lines).some(l=>!Number.isSafeInteger(l.quantity)))problems.push('PF-ordrens oprindelige vareantal kræver afstemning.');
 problems.push(...shipmentQuantityProblems(order,history));
 const duplicate=repeatedSKU(lines),keys=new Set(),deliveries=[];
 for(const delivery of history){
  if(typeof delivery.key!=='string'||!delivery.key||keys.has(delivery.key))problems.push('Leverancens entydige reference mangler.');else keys.add(delivery.key);
  if(!Number.isFinite(Date.parse(delivery.shipDate))||Date.parse(delivery.shipDate)>now)problems.push('Gyldig afsendelsesdato mangler.');
  if(!Array.isArray(delivery.items)||!delivery.items.length){problems.push('Afsendte vareantal mangler.');continue;}
  const quantities=new Map();
  for(const item of delivery.items){
   const matches=lines.flatMap((line,index)=>line.sku===item.sku?[index]:[]);
   if(!matches.length||!Number.isSafeInteger(item.quantity)||item.quantity<=0){problems.push('SKU eller afsendte vareantal kræver afstemning.');continue;}
   if(!duplicate)quantities.set(matches[0],(quantities.get(matches[0])||0)+item.quantity);
  }
  // Keep historical unique-SKU fingerprints byte-for-byte compatible.
  if(!duplicate)deliveries.push({...delivery,items:[...quantities].map(([index,quantity])=>({index,quantity})),fingerprint:createHash('sha256').update(JSON.stringify({items:delivery.items,date:delivery.shipDate})).digest('hex')});
 }
 if(duplicate){
  const complete=order.shipment?.isOrderComplete===true&&history.some(d=>d.isOrderComplete===true);
  if(!complete)problems.push('Gentagne SKU’er kræver komplet PF-ordre og præcist afstemte antal før fordeling på designlinjer.');
  const sent=new Map(skuQuantities(history.flatMap(d=>Array.isArray(d.items)?d.items:[])).map(i=>[i.sku,i.quantity]));
  if(complete&&skuQuantities(lines).some(i=>sent.get(i.sku)!==i.quantity))problems.push('PF melder komplet levering, men vareantal stemmer ikke.');
  if(!problems.length){
   const sourceDeliveries=[...history].sort((a,b)=>a.key.localeCompare(b.key)),sourceDeliveryKeys=sourceDeliveries.map(d=>d.key),tracking=new Map();
   for(const d of sourceDeliveries)for(const t of d.trackingDetails||[]){const old=tracking.get(t.trackingId);tracking.set(t.trackingId,{...old,...t,trackingURL:t.trackingURL||old?.trackingURL||null});}
   const trackingDetails=[...tracking.values()].sort((a,b)=>a.trackingId.localeCompare(b.trackingId));
   deliveries.push({key:'order-complete-v1',allocationScope:'supplier_order_complete',sourceDeliveryKeys,shipDate:new Date(Math.max(...history.map(d=>Date.parse(d.shipDate)))).toISOString(),carrier:[...new Set(sourceDeliveries.map(d=>d.carrier).filter(Boolean))].join(', '),trackingDetails,tracking:[...new Set([...sourceDeliveries.flatMap(d=>d.tracking||[]),...trackingDetails.map(t=>t.trackingId)])].sort(),isOrderComplete:true,items:lines.map((line,index)=>({index,quantity:line.quantity})),fingerprint:fingerprint({lines:lines.map(originalLine),parcels:sourceDeliveries.map(d=>({key:d.key,date:new Date(Date.parse(d.shipDate)).toISOString(),items:skuQuantities(d.items)}))})});
  }
 }
 return {deliveries:problems.length?[]:deliveries,problems:[...new Set(problems)]};
}

// One representation for finance, capture and SQLite. Original PF design rows
// must match the checkout group before an aggregate can establish line quantities.
export function validatedPFDeliveries(order,checkout,options={}){
 const result=validatedPFOrderDeliveries(order,options);
 // An unshipped order contributes no shipment evidence. Proof prepayment is
 // allowed before production and must not depend on shipment row mapping.
 if(!result.deliveries.length&&!result.problems.length)return result;
 const problems=[...result.problems],group=checkout.fulfillment?.groups?.[order.checkoutGroupIndex],indexes=Array.isArray(group?.lineIndexes)?group.lineIndexes:[],lines=order.lines||[];
 const validIndexes=Number.isSafeInteger(order.checkoutGroupIndex)&&order.checkoutId===checkout.id&&indexes.length>0&&new Set(indexes).size===indexes.length&&indexes.every(i=>Number.isSafeInteger(i)&&Boolean(checkout.lines?.[i]));
 if(!validIndexes)problems.push('Leverancen kan ikke knyttes til ordrelinjer.');
 if(validIndexes){
  const original=indexes.map(i=>checkout.lines[i]);
  if(lines.length!==original.length||lines.some((l,i)=>l.sku!==original[i]?.sku||l.quantity!==original[i]?.quantity))problems.push('PF-ordrens varelinjer matcher ikke den oprindelige ordregruppe.');
  if(repeatedSKU(lines)){
   const groups=checkout.fulfillment.groups,overlap=groups.some((g,i)=>i!==order.checkoutGroupIndex&&(g.lineIndexes||[]).some(index=>indexes.includes(index)));
   if(!checkout.pfOrderIds?.includes(order.id)||overlap||typeof group.location!=='string'||!group.location.trim()||group.location!==order.productionLocation||fingerprint(lines.map(originalLine))!==fingerprint(original.map(originalLine)))problems.push('PF-ordrens designlinjer matcher ikke den oprindelige ordregruppe.');
  }
 }
 return {deliveries:problems.length?[]:result.deliveries.map(d=>({...d,...(d.allocationScope?{fingerprint:fingerprint({source:d.fingerprint,checkoutId:checkout.id,groupIndex:order.checkoutGroupIndex,lineIndexes:indexes,productionLocation:order.productionLocation})}:{}),items:d.items.map(i=>({index:indexes[i.index],quantity:i.quantity}))})),problems:[...new Set(problems)]};
}
