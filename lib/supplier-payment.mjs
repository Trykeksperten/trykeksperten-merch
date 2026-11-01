import {supplierPaymentReady} from './production-payment.mjs';
import {getQuickpayPayment,quickpayPaymentState} from './quickpay.mjs';
import {quickpayTotals} from './sales-finance.mjs';

// A current provider authorization is required before a live supplier commitment.
// Neither this check nor a capture deadline promises a continuing bank hold.
export async function verifySupplierPayment(order,{env=process.env,fetchImpl=fetch,now=Date.now()}={}){
 if(!supplierPaymentReady(order,now+60000))throw Error('Kundens betalingsreservation er udløbet eller mangler en bekræftet frist. Afstem betalingen før PF-afsendelse.');
 if(order.paymentProvider==='bank_transfer')return;
 if(order.paymentProvider==='quickpay'){
  if(order.paymentMode!=='live')throw Error('En testbetaling eller betaling uden bekræftet live-status må ikke sendes til PF-produktion.');
  const payment=await getQuickpayPayment(order,{env,fetchImpl}),totals=quickpayTotals(payment);
  if(quickpayPaymentState(payment,order.totalIncVat)!=='authorized'||totals.pending||totals.captured||totals.refunded||totals.captureClosed)throw Error('Quickpay bekræfter ikke en uændret aktiv reservation. Afstem betalingen før PF-afsendelse.');
  return;
 }
 if(order.paymentProvider!=='stripe'||!/^pi_/.test(order.stripePaymentIntentId||''))throw Error('Betalingsudbyderen eller reservationen kan ikke bekræftes før PF-afsendelse.');
 const response=await fetchImpl(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(order.stripePaymentIntentId)}?expand[]=latest_charge`,{headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`},signal:AbortSignal.timeout(15000)});
 const payment=await response.json(),expiry=payment.latest_charge?.payment_method_details?.card?.capture_before;
 if(!response.ok||payment.id!==order.stripePaymentIntentId||payment.livemode!==true||payment.currency!=='dkk'||payment.status!=='requires_capture'||payment.amount!==order.totalIncVat||payment.amount_capturable!==order.totalIncVat||(expiry!==undefined&&(!Number.isFinite(expiry)||expiry*1000<=now+60000)))throw Error('Stripe bekræfter ikke en uændret aktiv reservation. Afstem betalingen før PF-afsendelse.');
}
