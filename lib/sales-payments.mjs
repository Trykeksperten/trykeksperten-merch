import {proofPrepayment} from '../dist/proof-payment-policy.mjs';
import {quickpayCaptureWindow} from './quickpay-capture-policy.mjs';
import {checkoutReadyForCapture} from './order-flow.mjs';
import {readCheckout,updateCheckout} from './checkout.mjs';
import {getQuickpayPayment,quickpayOperation} from './quickpay.mjs';
import {withLedger,ledgerOrder,recordVerifiedPayment,financeConfiguration,reconcileSalesShipments} from './sales-ledger.mjs';
import {quickpayTotals,invoicePolicy} from './sales-finance.mjs';
const stamp=()=>new Date().toISOString();
export async function reconcileSalesPayment(id,options={}){
 const order=await readCheckout(id),payment=await getQuickpayPayment(order,options);
 return withLedger(async data=>{
  const f=ledgerOrder(data,id);const totals=recordVerifiedPayment(f,order,payment);
  for(const op of f.operations.filter(o=>['requested','uncertain'].includes(o.status))){
   const candidates=(payment.operations||[]).filter(p=>p.type===op.kind&&!op.beforeIds.includes(p.id));
   if(candidates.length===1){const p=candidates[0];if(p.amount===op.amount&&!p.pending){op.providerOperationId=p.id;op.status=String(p.qp_status_code)==='20000'?'confirmed':'failed';op.error=op.status==='failed'?'Betalingsudbyderen afviste handlingen. Opret nyt forsøg efter afklaring.':null;}}
  }
  await updateCheckout(id,current=>{current.paymentTotals={captured:totals.captured,refunded:totals.refunded};if(totals.captured===current.totalIncVat){current.status='paid';current.paidAt||=totals.rows.filter(p=>p.type==='capture').at(-1)?.at||stamp();}else if(totals.captured>0)current.status='partially_paid';return current;});
  return f;
 });
}
export async function executeSalesPayment(id,input,options={}){
 const env=options.env||process.env,config=financeConfiguration(env);
 if(!config.enabled||!config.agreementConfirmed)throw Error('Økonomiflow og Quickpay/Clearhaus-aftalen for smerch.dk skal bekræftes før betaling.');
 if(!['capture','refund'].includes(input.kind)||!Number.isSafeInteger(input.amount)||input.amount<=0||!/^[a-zA-Z0-9:_-]{8,160}$/.test(input.key||''))throw Error('Ugyldig betalingshandling, beløb eller stabil handlingsreference.');
 if(input.kind==='capture'&&env.QUICKPAY_CAPTURE_ENABLED!=='1')throw Error('Quickpay-hævning er ikke aktiveret.');
 if(input.kind==='refund'&&env.QUICKPAY_REFUND_ENABLED!=='1')throw Error('Quickpay-refundering er ikke aktiveret.');
 if(input.kind==='capture')await reconcileSalesShipments(id);
 return withLedger(async(data,persist)=>{
  const order=await readCheckout(id),f=ledgerOrder(data,id);
  if(order.adminTest||order.adminLiveTest||order.paymentProvider!=='quickpay')throw Error('Betalingsflowet kræver en almindelig Quickpay-ordre. Brug isolerede testdata til test.');
  const existing=f.operations.find(o=>o.key===input.key);
  if(existing){if(existing.kind!==input.kind||existing.amount!==input.amount||existing.documentId!==input.documentId)throw Error('Handlingsreference genbrugt med andre oplysninger.');return existing;}
  if(f.operations.some(o=>['requested','uncertain'].includes(o.status)))throw Error('En tidligere betaling kræver afstemning. Der foretages ikke et nyt kald.');
  const payment=await getQuickpayPayment(order,options),totals=recordVerifiedPayment(f,order,payment);
  if(totals.pending)throw Error('Quickpay behandler en operation. Afvent bekræftelsen.');
  if(input.kind==='capture'){
   if(!['authorized','partially_paid'].includes(order.status))throw Error('Ordrestatus tillader ikke hævning. Afstem betalingen først.');
   const problems=invoicePolicy({...order,finance:f}).problems;if(problems.length)throw Error(problems.join(' '));
   if(f.problems.length)throw Error(f.problems.join(' '));
   if(payment.accepted!==true||!(payment.operations||[]).some(o=>o.type==='authorize'&&!o.pending&&String(o.qp_status_code)==='20000'&&o.amount===order.totalIncVat))throw Error('Aktiv reservation er ikke bekræftet hos Quickpay.');
   const shipped=f.shipments.reduce((n,s)=>n+s.total,0);
   if(totals.captureClosed)throw Error('Transaktionen er lukket for yderligere hævning. Restordren kræver en ny betaling.');
   if((!proofPrepayment(order)&&totals.captured+input.amount>shipped)||totals.captured+input.amount>order.totalIncVat)throw Error('Hævningen overstiger afsendte varer eller reservation.');
   if(input.amount!==order.totalIncVat||totals.captured)throw Error('Smerch hæver hele ordrebeløbet én gang. Delvise hævninger er ikke tilladt.');
   if((!proofPrepayment(order)&&shipped!==order.totalIncVat)||!await checkoutReadyForCapture(order))throw Error(proofPrepayment(order)?'Alle aktuelle korrekturer skal godkendes af kunden og Smerch før hævning.':'Hele ordren skal være bekræftet afsendt hos PF før hævning.');
   const window=quickpayCaptureWindow(order,payment,{env});if(!window.valid)throw Error(window.reason);
   if(window.lateCapture)f.events.push({at:stamp(),type:'late_capture_notice',message:'Hævning mere end syv dage efter autorisation: Clearhaus-gebyr og øget indsigelsesrisiko.'});
  }else{
   if(input.amount>totals.netPaid)throw Error('Refundering overstiger hævet beløb fratrukket tidligere refunderinger.');
   const credit=f.documents.find(d=>d.id===input.documentId&&d.kind==='credit');
   const already=f.operations.filter(o=>o.kind==='refund'&&o.documentId===input.documentId&&o.status!=='failed').reduce((n,o)=>n+o.amount,0);
   if(!credit||f.documents.some(d=>d.kind==='replacement'&&d.correctionPosting&&d.original===credit.original)||already+input.amount>credit.total)throw Error('Refunderingen skal knyttes til en kreditnota med tilstrækkeligt restbeløb.');
  }
  const op={key:input.key,kind:input.kind,amount:input.amount,documentId:input.documentId,status:'requested',paymentId:payment.id,beforeIds:(payment.operations||[]).map(o=>o.id),requestedAt:stamp()};f.operations.push(op);await persist();
  try{
   await quickpayOperation(payment.id,input.kind,input.amount,options);
   const fresh=await getQuickpayPayment(order,options);recordVerifiedPayment(f,order,fresh);
   const candidates=(fresh.operations||[]).filter(p=>p.type===op.kind&&!op.beforeIds.includes(p.id));
   if(candidates.length!==1||candidates[0].amount!==op.amount||candidates[0].pending)throw Error('Resultatet afventer afstemning hos Quickpay.');
   op.providerOperationId=candidates[0].id;op.status=String(candidates[0].qp_status_code)==='20000'?'confirmed':'failed';
   if(op.status==='failed')op.error='Quickpay afviste handlingen. Kontrollér reservationen før et nyt forsøg.';
   const t=quickpayTotals(fresh);
   await updateCheckout(id,current=>{current.paymentTotals={captured:t.captured,refunded:t.refunded};if(t.captured===current.totalIncVat){current.status='paid';current.paidAt||=stamp();}else if(t.captured>0)current.status='partially_paid';return current;});
  }catch(e){op.status='uncertain';op.error=String(e.message).slice(0,300);}
  await persist();return op;
 });
}
