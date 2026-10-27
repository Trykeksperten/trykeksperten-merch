// Presentation-only grouping. Never change payment/order records or release an order.
export function isUnfinishedPayment(checkout,pfs=[]){return !pfs.length&&!checkout.pfOrderIds?.length&&!checkout.paidAt&&['prepared','payment_setup','payment_setup_uncertain','awaiting_payment','expired','payment_failed','cancelled'].includes(checkout.status);}
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const emails=checkout=>[checkout.shipping?.email,checkout.billing?.email].map(value=>String(value||'').trim().toLowerCase()).filter(Boolean);
const sameCustomer=(a,b)=>emails(a).some(email=>emails(b).includes(email));
function fingerprint(checkout){
 if(!emails(checkout).length||!Number.isFinite(checkout.totalIncVat)||checkout.totalIncVat<=0||!checkout.lines?.length)return null;
 // Compare the complete admin line snapshot, including logo names, colours and placements.
 const lines=checkout.lines.map(line=>JSON.stringify(stable(line))).sort();
 const files=(checkout.artworks||[]).map(({name,size})=>JSON.stringify([name,size])).sort();
 return JSON.stringify([checkout.totalIncVat,checkout.currency||'DKK',lines,files]);
}
export function matchedPaymentAttempts(checkouts=[],orders=[]){
 const grouped=new Map(),hasPF=checkout=>orders.some(order=>order.checkoutId===checkout.id)||Boolean(checkout.pfOrderIds?.length);
 const completed=checkouts.filter(hasPF);
 for(const attempt of checkouts){
  if(!isUnfinishedPayment(attempt,orders.filter(o=>o.checkoutId===attempt.id)))continue;
  const key=fingerprint(attempt),started=Date.parse(attempt.createdAt);if(!key||!Number.isFinite(started))continue;
  const matches=completed.filter(c=>{const elapsed=Date.parse(c.createdAt)-started;return c.id!==attempt.id&&elapsed>=0&&elapsed<=24*60*60*1000&&sameCustomer(attempt,c)&&fingerprint(c)===key;});
  // Ambiguous purchases remain in the unmatched list rather than guessing an order.
  if(matches.length!==1)continue;
  const id=matches[0].id;if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(attempt);
 }
 return grouped;
}
