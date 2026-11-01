// Read model only: these totals are written by the existing verified-payment flow.
// Never infer a captured amount from an authorization or mark a partial capture paid.
export function checkoutPaymentProjection(checkout){
 const input=checkout.paymentTotals,hasTotals=input!==undefined;
 const valid=input&&Number.isSafeInteger(input.captured)&&input.captured>=0&&Number.isSafeInteger(input.refunded)&&input.refunded>=0&&input.refunded<=input.captured&&Number.isSafeInteger(checkout.totalIncVat)&&input.captured<=checkout.totalIncVat;
 const totals=valid?{captured:input.captured,refunded:input.refunded,netPaid:input.captured-input.refunded}:null;
 let status;
 if(hasTotals&&!valid)status='needs_reconciliation';
 else if(totals?.captured>0&&totals.refunded===totals.captured)status='refunded';
 else if(totals?.refunded>0)status='partially_refunded';
 else if(totals?.captured>0)status=totals.captured===checkout.totalIncVat?'paid':'partially_paid';
 else if(checkout.status==='partially_paid')status=totals?'needs_reconciliation':'partially_paid';
 else if(checkout.status==='paid')status=totals?'needs_reconciliation':checkout.paidAt?'paid':'needs_reconciliation';
 else status=checkout.status==='authorized'?'reserved':checkout.status==='cancelled'?'cancelled':'unpaid';
 const paidAt=checkout.paidAt&&Number.isFinite(Date.parse(checkout.paidAt))&&(totals?.captured===checkout.totalIncVat||checkout.status==='paid')?checkout.paidAt:null;
 return {status,totals,paidAt,confirmed:['authorized','paid','partially_paid'].includes(checkout.status)||Boolean(totals?.captured)};
}
