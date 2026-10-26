// Public delivery planning: a supplier processing status is not proof of dispatch.
export function deliveryStatusRows(order={}){
 if(['shipped','partially_shipped','cancelled','needs_attention','needs_reconciliation'].includes(order.status))return [];
 const labels={prepared:'Ordren er modtaget',submitting:'Ordren sendes til PF',gateway_accepted:'Afventer ordrebekræftelse fra PF',confirmed:'Ordren er bekræftet hos PF',awaiting_proof:'Afventer korrektur',proof_received:'Korrektur klar',revision_requested:'Korrekturen bliver rettet',approval_pending_pf:'Afventer PF’s bekræftelse af korrekturgodkendelsen',approval_recorded:'Korrektur godkendt hos PF · afventer produktion og afsendelse',processing:'PF behandler ordren'};
 const label=labels[order.status];if(!label)return [];
 const rows=[['Status',label]];
 if(typeof order.expectedShipDate==='string'&&Number.isFinite(Date.parse(order.expectedShipDate)))rows.push(['Forventet afsendelse',new Date(order.expectedShipDate).toLocaleDateString('da-DK',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'})]);
 rows.push(['Tracking','Tracking kommer, når ordren er afsendt.']);return rows;
}
export function publicPFDelivery(order){return {status:order.status,expectedShipDate:typeof order.expectedShipDate==='string'&&Number.isFinite(Date.parse(order.expectedShipDate))?order.expectedShipDate:null,tracking:order.shipment?.tracking||[],trackingDetails:order.shipment?.trackingDetails||[],carrier:order.shipment?.carrier||null};}
