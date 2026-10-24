import {orderKind,dateTime,paymentLabel,orderLabels} from './admin-order-state.mjs';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
export function appendOrderSummaryInfo(info,{checkout,orders=[],lines}){
 const order=orders[0]||{},shipping=checkout?.shipping||order.shipping||{},address=shipping.address||shipping,numbers=orders.map(o=>o.pfOrderNumber).filter(Boolean);
 info.append(el('span',orderKind(order,checkout),'pill'),el('h3',numbers.length?'Ordre '+numbers.join(' · '):'Ordre · PF-nummer afventer'));
 const company=checkout?.billing?.company||shipping.company,name=shipping.name;
 if(company||name)info.append(el('p',[company,name&&name!==company?name:null].filter(Boolean).join(' · '),'order-summary-customer'));
 info.append(el('small','Oprettet '+dateTime(checkout?.createdAt||order.createdAt)));
 for(const line of lines||checkout?.lines||order.lines||[]){const name=checkout?.productNames?.[line.productId]||line.productName||line.productId||line.sku;info.append(el('p',[`${line.quantity} stk. · ${name}`,line.sku&&line.sku!==name?'Varenr. '+line.sku:null].filter(Boolean).join(' · '),'order-summary-product'));}
 if(address.postalCode||address.city)info.append(el('small','Levering: '+[address.postalCode,address.city].filter(Boolean).join(' ')));
 const contact=el('div',null,'order-summary-contact');for(const [value,prefix] of [[shipping.email,'mailto:'],[shipping.phone,'tel:']])if(value){const link=el('a',value);link.href=prefix+(prefix==='tel:'?String(value).replace(/[^+\d]/g,''):value);contact.append(link);}if(contact.children.length)info.append(contact);
}
export function appendOrderSummaryState(state,checkout,orders=[]){
 const facts=el('dl',null,'order-summary-facts');const add=(label,value)=>{if(value)facts.append(el('dt',label),el('dd',value));};
 if(Number.isFinite(checkout?.totalIncVat))add('Total inkl. moms',(checkout.totalIncVat/100).toLocaleString('da-DK',{style:'currency',currency:'DKK'}));
 add('Betaling',paymentLabel(checkout));
 const statuses=[...new Set(orders.map(o=>orderLabels[o.status]||o.status).filter(Boolean))];if(statuses.length)add('Status',statuses.join(' · '));
 if(orders.some(o=>['approval_recorded','processing','confirmed'].includes(o.status)))add('Produktionsstart','Ikke bekræftet');
 const proofs=orders.filter(o=>o.proof).map(o=>`Version ${o.proof.version} · ${o.decision?.decision==='approve'?'godkendt':o.decision?.decision==='reject'?'ændringer ønsket':o.proof.customer?'hos kunden':'til gennemgang'}`);if(proofs.length)add('Korrektur',[...new Set(proofs)].join(' · '));
 const expected=[...new Set(orders.map(o=>o.expectedShipDate).filter(Boolean))];if(expected.length)add('Forventet afsendelse',expected.map(dateTime).join(' · '));
 state.append(facts);
}
