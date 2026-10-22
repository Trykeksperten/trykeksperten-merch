export function safeTrackingURL(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}}
export function trackingEntries(rows){return (Array.isArray(rows)?rows:[]).map(row=>{const id=typeof row==='string'?row:row?.trackingId;return typeof id==='string'&&id.trim()?{trackingId:id.slice(0,500),trackingURL:safeTrackingURL(typeof row==='object'?row.trackingURL:null)}:null;}).filter(Boolean);}
export function renderShipmentTracking(container,orders){
 container.replaceChildren();
 for(const order of orders||[]){
  if(!['shipped','partially_shipped'].includes(order.status))continue;
  const section=document.createElement('section'),title=document.createElement('p');
  title.textContent=`${order.status==='partially_shipped'?'Delvist afsendt':'Afsendt'}${order.carrier?' med '+order.carrier:''}`;section.append(title);
  const entries=trackingEntries(order.trackingDetails?.length?order.trackingDetails:order.tracking);
  if(!entries.length){const p=document.createElement('p');p.textContent='Tracking afventer fragtfirmaet.';section.append(p);}
  for(const entry of entries){const p=document.createElement('p');if(entry.trackingURL){const link=document.createElement('a');link.href=entry.trackingURL;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Følg pakken · '+entry.trackingId;p.append(link);}else p.textContent='Tracking: '+entry.trackingId;section.append(p);}
  container.append(section);
 }
}
