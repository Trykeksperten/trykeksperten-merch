import {bankPaymentComplete} from './production-payment.mjs';
import {updateCheckout} from './checkout.mjs';
export const bankPaymentTerms='Du modtager en faktura med betalingsoplysninger. Hele beløbet skal være modtaget, før vi bestiller eller sætter varer i produktion. Det gælder både med og uden tryk. Ved tryk skal korrekturen også godkendes før produktion.';
export function prepareBankPayment(order){
 if(order.adminTest||order.adminLiveTest||order.adminPilot)throw Error('Faktura kan ikke bruges til interne testordrer.');
 order.paymentProvider='bank_transfer';order.paymentMode='live';order.status='awaiting_bank_payment';
 order.bankPayment={invoiceNumber:null,receipts:[]};order.legal.prepaymentText=bankPaymentTerms;
 order.pfHandoff={status:'awaiting_payment',reason:'Afventer fuld bankbetaling. Ingen varer må bestilles hos PF.'};
 return order;
}
export function applyBankPayment(order,input,{actor,now=Date.now()}={}){
 if(actor?.type!=='staff'||!actor.name)throw Error('Medarbejderlogin kræves.');
 if(order.paymentProvider!=='bank_transfer'||!['awaiting_bank_payment','paid'].includes(order.status))throw Error('Ordren afventer ikke bankbetaling.');
 const at=new Date(now).toISOString();order.events??=[];
 if(input.action==='invoice'){
  const number=String(input.invoiceNumber||'').trim();if(!number||number.length>100)throw Error('Angiv nummeret på den faktura, der er oprettet og sendt til kunden.');
  if(order.bankPayment.invoiceNumber&&order.bankPayment.invoiceNumber!==number)throw Error('Fakturanummeret er allerede registreret.');
  if(order.bankPayment.invoiceNumber===number)return order;
  order.bankPayment.invoiceNumber=number;order.bankPayment.invoicedAt=at;
  order.events.push({type:'bank_invoice_registered',at,invoiceNumber:number,performedBy:actor});return order;
 }
 if(input.action!=='receipt'||input.confirmed!==true)throw Error('Bekræft, at beløbet er modtaget på bankkontoen.');
 if(!order.bankPayment.invoiceNumber)throw Error('Registrér den udstedte faktura først.');
 const amount=input.amount,reference=String(input.reference||'').trim();
 if(!Number.isSafeInteger(amount)||amount<=0||!reference||reference.length>200)throw Error('Angiv et positivt beløb og bankens transaktionsreference.');
 const existing=order.bankPayment.receipts.find(r=>r.reference===reference);
 if(existing){if(existing.amount!==amount)throw Error('Bankreferencen er allerede registreret med et andet beløb.');return order;}
 if(order.status==='paid')throw Error('Ordren er allerede fuldt betalt.');
 const received=order.bankPayment.receipts.reduce((n,r)=>n+r.amount,0);
 if(received+amount>order.totalIncVat)throw Error('Beløbet overstiger restbeløbet. Afstem overbetalingen, før du registrerer den del, der vedrører ordren.');
 order.bankPayment.receipts.push({amount,reference,at,actor:{type:'staff',name:actor.name}});
 order.events.push({type:'bank_payment_received',at,amount,reference,performedBy:actor});
 if(received+amount===order.totalIncVat){order.status='paid';order.paidAt=at;order.pfHandoff={status:'ready',reason:'Fuld bankbetaling registreret. Klar til kontrol og PF-afsendelse.'};}
 return order;
}
export const registerBankPayment=(id,input,options)=>updateCheckout(id,order=>applyBankPayment(order,input,options));
export function publicBankPayment(order){if(order.paymentProvider!=='bank_transfer')return null;return {invoiceNumber:order.bankPayment?.invoiceNumber||null,received:(order.bankPayment?.receipts||[]).reduce((n,r)=>n+r.amount,0),terms:bankPaymentTerms};}

// Persist the verified receipt before attempting supplier handoff. A supplier error
// must never undo a payment or make the administrator register the money twice.
export async function registerBankPaymentAndHandoff(id,input,{actor,now,handoff}={}){
 const order=await registerBankPayment(id,input,{actor,now});
 if(input.action!=='receipt'||!bankPaymentComplete(order)||order.pfHandoff?.status==='submitted')return order;
 try{return await handoff(order);}catch(error){
  return updateCheckout(id,current=>{
   if(current.pfHandoff?.status==='submitted')return current;
   const reason=error.message||'PF-overdragelsen kunne ikke gennemføres.';
   current.pfHandoff={status:'blocked',reason};current.events??=[];
   current.events.push({type:'pf_handoff_blocked',at:new Date().toISOString(),message:reason});return current;
  });
 }
}
