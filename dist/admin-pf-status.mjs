// Supplier planning is separate from confirmed shipments and payment release.
export function pfStatusRows(order={}){
 const valid=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
 const lastChange=(order.events||[]).filter(e=>e.type==='pf_status'&&valid(e.at)).map(e=>e.at).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
 const last=valid(order.pfStatusReceivedAt)?order.pfStatusReceivedAt:lastChange;
 const unchanged=valid(lastChange)&&valid(order.pfStatusReceivedAt)&&Date.parse(order.pfStatusReceivedAt)>Date.parse(lastChange);
 const types={pf_status:'Statusbesked',pf_shipment:'Forsendelsesoplysninger (ASN)',pf_confirmation:'Ordrebekræftelse'};
 const updates=(order.events||[]).filter(e=>types[e.type]&&valid(e.at)).map(e=>({at:e.at,label:types[e.type],unchanged:false}));
 if(valid(last))updates.push({at:last,label:types.pf_status,unchanged});
 const latest=updates.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||Number(b.unchanged)-Number(a.unchanged))[0];
 const received=latest?new Date(latest.at).toLocaleString('da-DK',{timeZone:'Europe/Copenhagen',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+' · '+latest.label+(latest.unchanged?' · Ingen ændringer':''):'Ikke modtaget';
 const expected=valid(order.expectedShipDate)?new Date(order.expectedShipDate).toLocaleDateString('da-DK',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'}):'Ikke modtaget fra PF';
 const trackingRows=!['shipped','partially_shipped','cancelled'].includes(order.status)?[['Tracking','Tracking kommer, når ordren er afsendt.']]:[];
 const actual=order.shipment?.shipDate||order.shipment?.deliveries?.at(-1)?.shipDate;
 const dispatched=['shipped','partially_shipped'].includes(order.status)&&valid(actual);
 return [...(valid(order.deliveryConfirmation?.at)?[['Levering bekræftet',new Date(order.deliveryConfirmation.at).toLocaleString('da-DK',{timeZone:'Europe/Copenhagen',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})+' · Manuelt']]:[]),...trackingRows,...(dispatched?[[order.status==='shipped'?'Afsendt':'Seneste delleverance',new Date(actual).toLocaleDateString('da-DK',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'})]]:[]),...(dispatched?[]:[['PF-status',order.pfStatus||'Ikke modtaget'],['Forventet afsendelse',expected]]),['Seneste opdatering fra PF',received],...(!dispatched&&String(order.pfStatusInformation||'').trim()?[['Besked fra PF',String(order.pfStatusInformation).trim()]]:[])];
}
