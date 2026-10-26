// Supplier planning is separate from confirmed shipments and payment release.
export function pfStatusRows(order={}){
 const valid=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
 const last=order.pfStatusReceivedAt||(order.events||[]).filter(e=>e.type==='pf_status'&&valid(e.at)).map(e=>e.at).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
 const expected=valid(order.expectedShipDate)?new Date(order.expectedShipDate).toLocaleDateString('da-DK',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'}):'Ikke modtaget fra PF';
 return [['PF-status',order.pfStatus||'Ikke modtaget'],['Forventet afsendelse',expected],['Seneste PF-status modtaget',valid(last)?new Date(last).toLocaleString('da-DK',{timeZone:'Europe/Copenhagen',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Ikke modtaget']];
}
