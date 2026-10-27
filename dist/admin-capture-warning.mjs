import {dateTime} from './admin-order-state.mjs';
const day=86400000;
// Prefer the gateway-derived deadline. The 179-day policy is measured from
// the successful authorization, unlike the time we received its callback.
export function captureWarning(checkout,{now=Date.now()}={}){
 if(!checkout||checkout.paymentProvider!=='quickpay'||checkout.adminTest||!['authorized','partially_paid','capture_reconciliation'].includes(checkout.status))return null;
 if(checkout.paidAt||Number.isFinite(checkout.paymentTotals?.captured)&&checkout.paymentTotals.captured>=checkout.totalIncVat)return null;
 const clearhausExpiry=checkout.captureDeadlinePolicy==='clearhaus-179-days'?Date.parse(checkout.authorizationExpiresAt):NaN;
 const authorized=Date.parse(checkout.authorizedAt);
 const deadline=Number.isFinite(clearhausExpiry)?clearhausExpiry-172*day:authorized+7*day;
 if(!Number.isFinite(deadline)||!Number.isFinite(now)||deadline-now>day)return null;
 const overdue=now>=deadline,deadlineAt=new Date(deadline).toISOString();
 const title=overdue?'7-dagesgrænsen er nået · betaling ikke fuldt hævet':'Under 24 timer til 7-dagesgrænsen · betaling ikke fuldt hævet';
 const message=(overdue?'Der er gået mindst 7 dage siden reservationen.':'7-dagesgrænsen nås '+dateTime(deadlineAt)+'.')+' Kontrollér betaling og korrekturgodkendelser. Sen hævning kan medføre ekstra gebyr hos Clearhaus. Hævning kræver fortsat de nødvendige godkendelser.';
 return {overdue,deadlineAt,title,message};
}
export function appendCaptureWarning(parent,checkout){
 const warning=captureWarning(checkout);if(!warning)return;
 const box=document.createElement('div'),title=document.createElement('strong'),message=document.createElement('p');
 box.className='capture-warning'+(warning.overdue?' capture-warning-overdue':'');box.setAttribute('role','status');
 title.textContent=warning.title;message.textContent=warning.message;box.append(title,message);parent.append(box);
 return box;
}
