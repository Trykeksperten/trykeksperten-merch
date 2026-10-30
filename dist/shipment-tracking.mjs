import {deliveryStatusRows} from './order-delivery-status.mjs';
export function safeTrackingURL(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}}
export function localizedTrackingURL(value,trackingId){
 const safe=safeTrackingURL(value);if(!safe)return null;
 const url=new URL(safe);
 if(/^(www\.)?postnord\.(se|dk|no|fi)$/.test(url.hostname)||url.hostname==='tracking.postnord.com'){
  const target=new URL('https://www.postnord.dk/varktojer/track-trace');
  target.searchParams.set('shipmentId',trackingId);return target.href;
 }
 return safe;
}
export function trackingEntries(rows){return (Array.isArray(rows)?rows:[]).map(row=>{const id=typeof row==='string'?row:row?.trackingId;return typeof id==='string'&&id.trim()?{trackingId:id.slice(0,500),trackingURL:localizedTrackingURL(typeof row==='object'?row.trackingURL:null,id.trim().slice(0,500))}:null;}).filter(Boolean);}
export function renderShipmentTracking(container,orders){
 container.replaceChildren();
 for(const order of orders||[]){
  if(!['shipped','partially_shipped'].includes(order.status)){
   const rows=deliveryStatusRows(order);if(rows.length){const section=document.createElement('section');for(const [label,value] of rows){const p=document.createElement('p');p.textContent=label==='Status'?value:label==='Tracking'?value:`${label}: ${value}`;section.append(p);}container.append(section);}continue;
  }
  const section=document.createElement('section'),title=document.createElement('p');
  title.textContent=`${order.status==='partially_shipped'?'Delvist afsendt':'Afsendt'}${order.carrier?' med '+order.carrier:''}`;section.append(title);
  const entries=trackingEntries(order.trackingDetails?.length?order.trackingDetails:order.tracking);
  if(!entries.length){const p=document.createElement('p');p.textContent='Tracking afventer fragtfirmaet.';section.append(p);}
  for(const entry of entries){const p=document.createElement('p');if(entry.trackingURL){const link=document.createElement('a');link.href=entry.trackingURL;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Følg pakken · '+entry.trackingId;p.append(link);}else p.textContent='Tracking: '+entry.trackingId;section.append(p);}
  container.append(section);
 }
}
