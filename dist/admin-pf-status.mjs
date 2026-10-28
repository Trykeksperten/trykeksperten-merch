// Supplier planning is separate from confirmed shipments and payment release.
export function pfStatusRows(order={}){
 const valid=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
 const lastChange=(order.events||[]).filter(e=>e.type==='pf_status'&&valid(e.at)).map(e=>e.at).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
 const last=valid(order.pfStatusReceivedAt)?order.pfStatusReceivedAt:lastChange;
 const unchanged=valid(lastChange)&&valid(order.pfStatusReceivedAt)&&Date.parse(order.pfStatusReceivedAt)>Date.parse(lastChange);
 const received=valid(last)?new Date(last).toLocaleString('da-DK',{timeZone:'Europe/Copenhagen',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+(unchanged?' · Ingen ændringer':'' ):'Ikke modtaget';
 const expected=valid(order.expectedShipDate)?new Date(order.expectedShipDate).toLocaleDateString('da-DK',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'}):'Ikke modtaget fra PF';
 const trackingRows=!['shipped','partially_shipped','cancelled'].includes(order.status)?[['Tracking','Tracking kommer, når ordren er afsendt.']]:[];
 const actual=order.shipment?.shipDate||order.shipment?.deliveries?.at(-1)?.shipDate;
 const dispatched=['shipped','partially_shipped'].includes(order.status)&&valid(actual);
 return [...trackingRows,...(dispatched?[[order.status==='shipped'?'Afsendt':'Seneste delleverance',new Date(actual).toLocaleDateString('da-DK',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'})]]:[]),['PF-status',(order.pfStatus||'Ikke modtaget')+(dispatched?' · særskilt statusbesked; se afsendelse':'')],['Forventet afsendelse',expected],['Seneste PF-status modtaget',received],...(String(order.pfStatusInformation||'').trim()?[['Besked fra PF',String(order.pfStatusInformation).trim()]]:[])];
}
