import {methodAccounting,queueMethodAccountantMail} from './method-accounting.mjs';
import {proofPrepayment} from '../dist/proof-payment-policy.mjs';
import {checkoutReadyForCapture} from './order-flow.mjs';
import {listCheckouts} from './checkout.mjs';
import {financeAutomationEligible,financeConfiguration,readLedger,reconcileSalesShipments} from './sales-ledger.mjs';
import {executeSalesPayment} from './sales-payments.mjs';
import {sendFinanceMail} from './sales-mail.mjs';
let busy=false;
export async function processSalesFinance({env=process.env,fetchImpl=fetch,transport}={}){
 const config=financeConfiguration(env);if(busy||!config.enabled||(!config.automationsEnabled&&!config.automaticCapture&&config.accountantMail!=='automatic'&&config.receiptMail!=='automatic')||!Number.isFinite(Date.parse(config.startAt)))return;busy=true;
 try{
  const eligible=(await listCheckouts()).filter(order=>financeAutomationEligible(order,config)),eligibleIds=new Set(eligible.map(o=>o.id));
  for(const order of eligible){
   if(methodAccounting(order)&&order.paymentProvider==='bank_transfer'){
    if(env.SMERCH_ACCOUNTANT_MAIL==='automatic')try{for(const row of await queueMethodAccountantMail(order.id,{finance:config}))await sendFinanceMail(order.id,row.key,{env,automatic:true,transport});}catch(e){console.error(JSON.stringify({event:'invoice_request_requires_attention',orderId:order.id,message:String(e.message).slice(0,200)}));}
    continue;
   }
   if(order.paymentProvider!=='quickpay')continue;
   try{const f=await reconcileSalesShipments(order.id);

    const captured=f.payments.filter(p=>p.type==='capture').reduce((n,p)=>n+p.amount,0),shipped=f.shipments.reduce((n,s)=>n+s.total,0);
    if(config.automaticCapture&&!proofPrepayment(order)&&order.totalIncVat>0&&captured===0&&shipped===order.totalIncVat&&await checkoutReadyForCapture(order))await executeSalesPayment(order.id,{kind:'capture',amount:order.totalIncVat,key:'shipment-capture:'+order.totalIncVat},{env,fetchImpl});
   }catch(e){console.error(JSON.stringify({event:'sales_finance_requires_attention',orderId:order.id,message:String(e.message).slice(0,300)}));}
  }
  if(config.receiptMail==='automatic')for(const [id,f] of Object.entries((await readLedger()).orders).filter(([id])=>eligibleIds.has(id)))for(const row of f.mail.filter(m=>m.kind==='payment_receipt'&&m.status==='review'))try{await sendFinanceMail(id,row.key,{env,automatic:true,transport});}catch(e){console.error(JSON.stringify({event:'payment_receipt_requires_attention',orderId:id,message:String(e.message).slice(0,200)}));}
 }finally{busy=false;}
}
