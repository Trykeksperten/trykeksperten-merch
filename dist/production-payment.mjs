export function bankPaymentComplete(order){
 const bank=order?.bankPayment;
 return order?.paymentProvider==='bank_transfer'&&order.status==='paid'&&Number.isSafeInteger(order.totalIncVat)&&order.totalIncVat>0&&Boolean(bank?.invoiceNumber)&&Array.isArray(bank?.receipts)&&bank.receipts.length>0&&bank.receipts.every(r=>Number.isSafeInteger(r.amount)&&r.amount>0&&r.reference&&r.actor?.type==='staff'&&r.actor?.name)&&new Set(bank.receipts.map(r=>r.reference)).size===bank.receipts.length&&bank.receipts.reduce((sum,r)=>sum+r.amount,0)>=order.totalIncVat;
}
export function productionPaymentActive(order,now=Date.now()){
 if(order?.paymentProvider==='bank_transfer')return bankPaymentComplete(order);
 return order?.status==='paid'||(order?.status==='authorized'&&Number.isFinite(Date.parse(order.authorizationExpiresAt))&&Date.parse(order.authorizationExpiresAt)>now);
}

export function supplierPaymentReady(order){return order?.paymentProvider==='bank_transfer'?bankPaymentComplete(order):order?.status==='authorized';}
