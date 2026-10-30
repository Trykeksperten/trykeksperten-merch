// Quickpay order_id is Clearhaus' Reference, not Quickpay's numeric payment id.
export function accountingPayment(order, payments){
 const total=order.totalIncVat;
 const captured=payments?payments.filter(p=>p.type==='capture').reduce((n,p)=>n+p.amount,0):order.paymentTotals?.captured;
 const refunded=payments?payments.filter(p=>p.type==='refund').reduce((n,p)=>n+p.amount,0):order.paymentTotals?.refunded||0;
 const paid=Number.isSafeInteger(total)&&total>0&&captured===total;
 const status=refunded>0?'Beløbet er hævet – helt eller delvist refunderet':paid?'Betalt – beløbet er hævet':captured>0?'Delvist hævet – produktion må ikke startes':order.paymentProvider==='bank_transfer'||order.legal?.prepayment?'Afventer forudbetaling – produktion må ikke startes':order.status==='authorized'?'Reserveret – ikke hævet':'Betaling ikke bekræftet';
 return {paymentStatus:status,accountingReference:order.quickpayOrderId||'',quickpayPaymentId:order.quickpayPaymentId||'',captureDates:payments?payments.filter(p=>p.type==='capture').map(p=>p.at).filter(Boolean):captured>0&&order.paidAt?[order.paidAt]:[],captured,refunded};
}
export function accountingReferenceText(d){return [`Clearhaus Reference / Quickpay order_id: ${d.accountingReference||'MANGLER – afstem før bogføring'}`,`Quickpay-transaktion: ${d.quickpayPaymentId||'mangler'}`,...(d.captureDates||[]).map(at=>'Hævningsdato: '+at)].join('\n');}
