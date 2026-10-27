import {appendPaymentAttemptDetails} from './admin-payment-attempt.mjs?v=3';
import {dateTime,paymentLabel} from './admin-order-state.mjs';
export function paymentAttemptHistory(attempts=[]){
 if(!attempts.length)return null;
 const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(cls)node.className=cls;return node;};
 const fold=el('details',null,'proof-fold');fold.append(el('summary',`Afbrudte og uafsluttede betalingsforsøg (${attempts.length})`),el('p','Tidligere forsøg med samme kunde, produkter og beløb. De tæller ikke som ekstra ordrer eller gennemførte betalinger.','muted'));
 for(const attempt of [...attempts].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))){
  const row=el('article',null,'payment-attempt-history-row'),open=el('button','Åbn betalingsdetaljer');open.type='button';appendPaymentAttemptDetails(row,open,attempt);
  row.append(el('p',`${dateTime(attempt.createdAt)} · ${paymentLabel(attempt)}`),open);fold.append(row);
 }
 return fold;
}
