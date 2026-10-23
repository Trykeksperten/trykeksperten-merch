import {renderShipmentTracking} from './shipment-tracking.mjs';
// Presentation only: supplier references are shown exactly as stored.
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
export function orderOverview(order,checkout){
 const grid=el('div',null,'pf-order-overview'),status=el('section'),products=el('section'),delivery=el('section');
 status.append(el('h3','Ordrestatus'));const dl=el('dl');for(const [label,value] of [['PF-bestillingsnummer',order.pfOrderNumber||'Afventer PF'],['Smerch-reference',order.purchaseOrderNumber],['Ordredato',order.createdAt?new Date(order.createdAt).toLocaleDateString('da-DK'):'—'],['Betaling',checkout?({authorized:'Reserveret',paid:'Hævet',cancelled:'Annulleret'}[checkout.status]||checkout.status):'—'],['Afsendelsesdato',order.shipment?.shipDate||'—'],['Fragtfirma',order.shipment?.carrier||'—']])dl.append(el('dt',label),el('dd',value||'—'));status.append(dl);const tracking=el('div');renderShipmentTracking(tracking,[{status:order.status,...order.shipment}]);status.append(tracking);
 products.append(el('h3','Ordreoversigt'));for(const line of order.lines||[])products.append(el('p',`${line.quantity} stk. · ${checkout?.productNames?.[line.productId]||line.productName||line.productId} · ${line.sku}`));if(Number.isFinite(checkout?.totalIncVat))products.append(el('p','Kundepris inkl. moms: '+(checkout.totalIncVat/100).toLocaleString('da-DK',{style:'currency',currency:'DKK'})));
 const shipping=checkout?.shipping||order.shipping||{},address=shipping.address||shipping;delivery.append(el('h3','Leveringsadresse'));const lines=[shipping.company,shipping.name,address.street,address.street2,shipping.deliveryComment,[address.postalCode,address.city].filter(Boolean).join(' '),address.country,shipping.email].filter(Boolean);delivery.append(el('p',lines.join('\n')||'Ikke oplyst'));
 grid.append(status,products,delivery);return grid;
}
