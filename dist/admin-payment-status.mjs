import {dateTime,paymentLabel} from './admin-order-state.mjs';

export function appendPaymentStatus(parent,checkout,{onUpdate=()=>{}}={}){
 if(!checkout||checkout.paymentProvider!=='quickpay')return;
 const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const box=el('details'),summary=el('summary','Betalingsdetaljer'),facts=el('dl'),button=el('button','Kontrollér betalingsstatus'),feedback=el('p');
 box.className='payment-status-control';button.type='button';button.className='payment-attempt-toggle';feedback.setAttribute('role','status');
 const draw=()=>{summary.textContent='Betalingsdetaljer'+(checkout.paymentMethod?' · '+checkout.paymentMethod:'');facts.replaceChildren();for(const [label,value] of [['Status',paymentLabel(checkout)],['Betalingsmetode',checkout.paymentMethod||(checkout.paymentCheckedAt||checkout.paymentStatusReceivedAt?'Ikke oplyst af Quickpay':'Ikke hentet endnu')],['Seneste status modtaget',checkout.paymentStatusReceivedAt?dateTime(checkout.paymentStatusReceivedAt):'Ikke registreret'],['Senest kontrolleret hos Quickpay',checkout.paymentCheckedAt?dateTime(checkout.paymentCheckedAt):'Ikke kontrolleret manuelt']])facts.append(el('dt',label),el('dd',value));};
 button.onclick=async()=>{
  button.disabled=true;feedback.textContent='Kontrollerer hos Quickpay…';
  try{
   const response=await fetch('/api/admin/checkouts/'+encodeURIComponent(checkout.id)+'/payment-status',{method:'POST',credentials:'same-origin',headers:{'X-Smerch-Admin':'1'},cache:'no-store'}),data=await response.json();
   if(!response.ok)throw Error(data.error||'Status kunne ikke hentes.');
   Object.assign(checkout,data);draw();await onUpdate(checkout);feedback.textContent='Betalingsstatus er kontrolleret hos Quickpay.';
  }catch(error){feedback.textContent=error.message;}finally{button.disabled=false;}
 };
 draw();box.append(summary,facts,button,feedback);parent.append(box);
}
