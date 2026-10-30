import {readOrder} from './pf-orders.mjs';
// Display references only: never change payment IDs or supplier lookup keys.
export function documentOrderNumber(order){
 const numbers=[order?.pfOrderNumber,...(order?.documentOrderNumbers||[])].map(v=>String(v??'').trim()).filter(Boolean);
 return [...new Set(numbers)].join(', ')||'Afventer ordrenummer';
}
export async function withDocumentOrderNumbers(order){
 const suppliers=await Promise.all((order.pfOrderIds||[]).map(readOrder));
 return {...order,documentOrderNumbers:suppliers.map(p=>p.pfOrderNumber).filter(Boolean)};
}
