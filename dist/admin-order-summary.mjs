import {appendCaptureWarning} from './admin-capture-warning.mjs';
import {pfStatusRows} from './admin-pf-status.mjs?v=3';
import {orderKind,dateTime,paymentLabel,orderLabels} from './admin-order-state.mjs';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
export function appendOrderSummaryInfo(info,{checkout,orders=[],lines}){
 const order=orders[0]||{},shipping=checkout?.shipping||order.shipping||{},numbers=orders.map(o=>o.pfOrderNumber).filter(Boolean);
 info.append(el('span',orderKind(order,checkout),'pill'),el('h3',numbers.length?'Ordre '+numbers.join(' · '):'Ordre · PF-nummer afventer'));
 const company=checkout?.billing?.company||shipping.company,name=shipping.name;
 if(company||name)info.append(el('p',[company,name&&name!==company?name:null].filter(Boolean).join(' · '),'order-summary-customer'));
 info.append(el('small','Oprettet '+dateTime(checkout?.createdAt||order.createdAt)));
 for(const line of lines||checkout?.lines||order.lines||[]){const name=checkout?.productNames?.[line.productId]||line.productName||line.productId||line.sku;info.append(el('p',`${line.quantity} stk. · ${name}`,'order-summary-product'));}
}
export function appendOrderSummaryState(state,checkout,orders=[]){
 const facts=el('dl',null,'order-summary-facts'),dispatchCells=new Map();const add=(label,value)=>{if(!value)return;const cell=el('dd',value);facts.append(el('dt',label),cell);return cell;};
 if(Number.isFinite(checkout?.totalIncVat))add('Total inkl. moms',(checkout.totalIncVat/100).toLocaleString('da-DK',{style:'currency',currency:'DKK'}));
 add('Betaling',paymentLabel(checkout));
 if(checkout?.paymentMethod)add('Betalingsmetode',checkout.paymentMethod);
 const statuses=[...new Set(orders.map(o=>o.status==='approval_recorded'?'Afventer produktion hos PF':orderLabels[o.status]||o.status).filter(Boolean))];if(statuses.length)add('Status',statuses.join(' · '));else if(checkout?.pfReview?.required&&!checkout.pfReview.approved)add('Status','Afventer Smerchs godkendelse');
 for(const order of orders){
  const pf=Object.fromEntries(pfStatusRows(order)),suffix=orders.length>1?' · '+(order.pfOrderNumber||order.purchaseOrderNumber||'PF-nummer afventer'):'';
  add('Seneste PF-status'+suffix,pf['PF-status']);
  const dispatch=add('Forventet afsendelse'+suffix,pf['Forventet afsendelse']);dispatch.className='order-summary-dispatch';dispatchCells.set(order,dispatch);
 }
 state.append(facts);appendCaptureWarning(state,checkout);return dispatchCells;
}

export function assembleOrderSummaryCard(card,gallery,info,state){
 const productBlock=el('div',null,'order-summary-product-block');gallery.className='order-summary-media';productBlock.append(gallery,info);card.className+=' order-summary-scaled';card.append(productBlock,state);
 return card;
}
