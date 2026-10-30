import {proofPrepayment} from '../dist/proof-payment-policy.mjs';
import {checkoutReadyForCapture} from './order-flow.mjs';
import {listCheckouts} from './checkout.mjs';
import {financeConfiguration,readLedger,reconcileSalesShipments} from './sales-ledger.mjs';
import {executeSalesPayment} from './sales-payments.mjs';
import {sendFinanceMail,queueAccountantBasis} from './sales-mail.mjs';
let busy=false;
export async function processSalesFinance({env=process.env,fetchImpl=fetch,transport}={}){
 const config=financeConfiguration(env);if(busy||!config.enabled||(!config.automationsEnabled&&!config.automaticCapture&&config.accountantMail!=='automatic'&&config.receiptMail!=='automatic')||!Number.isFinite(Date.parse(config.startAt)))return;busy=true;
 try{
  const eligible=(await listCheckouts()).filter(o=>Number.isFinite(Date.parse(o.createdAt))&&Date.parse(o.createdAt)>=Date.parse(config.startAt)),eligibleIds=new Set(eligible.map(o=>o.id));
  for(const order of eligible){
   if(order.adminTest||order.adminLiveTest||order.paymentProvider!=='quickpay')continue;
   try{const f=await reconcileSalesShipments(order.id);

    const captured=f.payments.filter(p=>p.type==='capture').reduce((n,p)=>n+p.amount,0),shipped=f.shipments.reduce((n,s)=>n+s.total,0);
    if(config.automaticCapture&&!proofPrepayment(order)&&order.totalIncVat>0&&captured===0&&shipped===order.totalIncVat&&await checkoutReadyForCapture(order))await executeSalesPayment(order.id,{kind:'capture',amount:order.totalIncVat,key:'shipment-capture:'+order.totalIncVat},{env,fetchImpl});
    // Accountant snapshots must contain the final verified payment, never the earlier reservation.
    const current=(await readLedger()).orders[order.id],paid=current?.payments.filter(p=>p.type==='capture').reduce((n,p)=>n+p.amount,0),refunded=current?.payments.filter(p=>p.type==='refund').reduce((n,p)=>n+p.amount,0);
    if(shipped===order.totalIncVat&&paid===order.totalIncVat&&refunded===0&&config.accountantMail==='automatic')for(const shipment of current.shipments.filter(s=>s.invoiceStatus!=='issued')){try{const row=await queueAccountantBasis(order.id,shipment.key,{env});await sendFinanceMail(order.id,row.key,{env,automatic:true,transport});}catch(e){console.error(JSON.stringify({event:'accountant_basis_requires_attention',orderId:order.id,message:String(e.message).slice(0,200)}));}}
   }catch(e){console.error(JSON.stringify({event:'sales_finance_requires_attention',orderId:order.id,message:String(e.message).slice(0,300)}));}
  }
  if(config.receiptMail==='automatic')for(const [id,f] of Object.entries((await readLedger()).orders).filter(([id])=>eligibleIds.has(id)))for(const row of f.mail.filter(m=>m.kind==='payment_receipt'&&m.status==='review'))try{await sendFinanceMail(id,row.key,{env,automatic:true,transport});}catch(e){console.error(JSON.stringify({event:'payment_receipt_requires_attention',orderId:id,message:String(e.message).slice(0,200)}));}
 }finally{busy=false;}
}
