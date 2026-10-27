const money=value=>(value/100).toLocaleString('da-DK',{minimumFractionDigits:2,maximumFractionDigits:2})+' kr.';
export function documentPaymentPolicy(order){
 if(order?.paymentProvider!=='bank_transfer')return order?.legal?.prepayment===true?{paymentTerms:order.legal.prepaymentText,paymentInstruction:'Kortbetaling via betalingsudbyderen. Hæves efter kundens korrekturgodkendelse og Smerchs interne godkendelse, før PF-godkendelsen sendes. Afstem betalingsstatus; opret ikke en ny betalingsanmodning eller bankopkrævning for samme beløb.'}:{};
 const received=(order.bankPayment?.receipts||[]).reduce((sum,row)=>sum+(Number.isSafeInteger(row.amount)?row.amount:0),0);
 const paid=order.status==='paid'&&Boolean(order.paidAt)&&received===order.totalIncVat;
 const invoiceNumber=order.bankPayment?.invoiceNumber||'';
 return {
  paymentProvider:'bank_transfer',
  paymentTerms:'Forudbetaling via bankoverførsel. Hele ordrebeløbet skal være modtaget før varebestilling og produktionsstart. Ved varer med tryk skal korrekturen også være godkendt.',
  paymentStatus:paid?'Betalt via bankoverførsel':received>0?'Delvist betalt via bankoverførsel - afventer restbetaling':'Afventer forudbetaling via bankoverførsel',
  paymentInstruction:invoiceNumber
   ?'Forudbetalingsfaktura '+invoiceNumber+' er allerede registreret. Brug den eksisterende faktura; opret ikke en ny opkrævning for samme ordre.'
   :'Opret en forudbetalingsfaktura på hele ordrebeløbet inkl. moms. Angiv forudbetaling før varebestilling og produktionsstart. Ingen kreditfrist.',
  paymentReceived:received,
  paymentOutstanding:Math.max(0,order.totalIncVat-received),
  existingInvoiceNumber:invoiceNumber
 };
}
