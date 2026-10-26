import {appendPaymentStatus} from './admin-payment-status.mjs?v=2';
import {dateTime,paymentLabel} from './admin-order-state.mjs';

export function appendPaymentAttemptDetails(row,button,checkout){
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
  const details=el('section'),fields=el('dl');
  details.id='payment-attempt-'+checkout.id;
  details.className='payment-attempt-details';
  details.hidden=true;
  details.setAttribute('aria-label','Betalingsdetaljer');
  const add=(label,value)=>{fields.append(el('dt',label),el('dd',value||'Ikke registreret'));};
  const status={prepared:'Betaling klargjort',payment_setup:'Betaling oprettes',payment_setup_uncertain:'Oprettelse af betaling skal afklares',payment_failed:'Betaling mislykkedes'}[checkout.status]||paymentLabel(checkout);
  add('Status',status);
  add('Beløb inkl. moms',Number.isFinite(checkout.totalIncVat)?(checkout.totalIncVat/100).toLocaleString('da-DK',{style:'currency',currency:'DKK'}):null);
  add('Oprettet',checkout.createdAt?dateTime(checkout.createdAt):null);
  add('Kunde',checkout.shipping?.name||checkout.billing?.name);
  add('E-mail',checkout.shipping?.email||checkout.billing?.email);
  add('Betalingsudbyder',checkout.paymentProvider==='quickpay'?'Quickpay':checkout.paymentProvider);
  add('Betalingsreference',checkout.quickpayPaymentId?String(checkout.quickpayPaymentId):null);
  add('Checkout-reference',checkout.id);
  details.append(el('h3','Betalingsdetaljer'),el('p','Kunden har startet checkout, men systemet har ikke registreret en gennemført betaling. Der er ingen PF-ordre knyttet til dette forsøg. Kunden kan have gennemført købet i et andet forsøg, fx efter skift af betalingsmetode.'),fields);
  appendPaymentStatus(details,checkout);
  row.classList.add('payment-attempt-card');
  button.classList.add('payment-attempt-toggle');
  button.setAttribute('aria-controls',details.id);
  button.setAttribute('aria-expanded','false');
  button.onclick=()=>{
    if(!details.parentElement)row.append(details);
    details.hidden=!details.hidden;
    button.setAttribute('aria-expanded',String(!details.hidden));
    button.textContent=details.hidden?'Åbn betalingsdetaljer':'Luk betalingsdetaljer';
  };
}
