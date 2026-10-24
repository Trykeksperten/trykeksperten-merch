import {quickpayCaptureWindow} from './quickpay-capture-policy.mjs';
import {quickpayTotals} from './sales-finance.mjs';
import {assertAdminCheckoutTest,assertAdminLiveTest,isAdminLiveTest,assertAdminPilot} from './admin-checkout-test.mjs';
import {paymentOrigins} from './payment-origin.mjs';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {checkoutConfiguration,listCheckouts,readCheckout,updateCheckout} from './checkout.mjs';

const base='https://api.quickpay.net';
const paymentOrderId=(id,attempt=0)=>`SM${createHash('sha256').update(id).digest('hex').slice(0,14)}${String(attempt).padStart(4,'0')}`;
const successful=operation=>operation&&!operation.pending&&String(operation.qp_status_code)==='20000';
const last=(payment,type)=>(payment.operations||[]).filter(operation=>operation.type===type).at(-1);
const errorText=(data,fallback)=>String(data?.message||data?.error||fallback).slice(0,180);
function assertPaymentMode(payment,env,order){
 const live=isAdminLiveTest(order||{})||env.QUICKPAY_MODE==='live';
 if((live&&payment.test_mode!==false)||(!live&&payment.test_mode===false))throw Error('Quickpay-betalingens test/live-status matcher ikke butikkens betalingsmiljø.');
}
function headers(env){return {Authorization:`Basic ${Buffer.from(`:${env.QUICKPAY_API_KEY}`).toString('base64')}`,'Accept-Version':'v10','Content-Type':'application/json'};}
async function request(path,{method='GET',body,env=process.env,fetchImpl=fetch}={}){const response=await fetchImpl(`${base}${path}`,{method,headers:headers(env),body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const result=response.status===204?null:await response.json();if(!response.ok)throw Error(errorText(result,`Quickpay svarede ${response.status}.`));return result;}
export function verifyQuickpayCallback(raw,header,privateKey){if(!Buffer.isBuffer(raw)||!privateKey||!/^[a-f0-9]{64}$/i.test(String(header||'')))return false;return timingSafeEqual(createHmac('sha256',privateKey).update(raw).digest(),Buffer.from(header,'hex'));}
export function quickpayPaymentState(payment,expectedAmount){
 if(payment?.type!=='Payment'||String(payment.currency).toUpperCase()!=='DKK'||Number(payment.link?.amount??last(payment,'authorize')?.amount??last(payment,'capture')?.amount)!==expectedAmount)return 'invalid';
 const authorization=last(payment,'authorize'),capture=last(payment,'capture'),cancel=last(payment,'cancel');
 const totals=quickpayTotals(payment);if(totals.captured>expectedAmount)return 'invalid';if(totals.captured===expectedAmount)return 'paid';if(totals.captured>0)return 'partially_paid';
 if(successful(cancel)&&(!capture||Number(cancel.id)>Number(capture.id)))return 'cancelled';
 if(successful(authorization)&&authorization.amount===expectedAmount&&payment.accepted===true)return 'authorized';
 if(authorization&&!successful(authorization))return authorization.pending?'pending':'failed';
 return 'pending';
}
export async function createQuickpayLink(id,{env=process.env,fetchImpl=fetch}={}){
 const order=await readCheckout(id);if(order.adminPilot)assertAdminPilot(true,env);if(order.adminLiveTest&&!isAdminLiveTest(order))throw Error('Ugyldig live-test.');if(isAdminLiveTest(order))assertAdminLiveTest(true,env);else if(order.adminTest)assertAdminCheckoutTest(true,env);const config=checkoutConfiguration({...env,PAYMENT_PROVIDER:'quickpay'});if(order.paymentProvider!=='quickpay'||!config.ready)throw Error(config.reason||'Quickpay er ikke valgt.');if(!['prepared','payment_setup','authorization_expired','expired','payment_failed'].includes(order.status))throw Error('Betalingen kan ikke startes igen.');
 const attempt=order.paymentAttempt||0,qpOrderId=paymentOrderId(id,attempt),url=paymentOrigins(env).customer,callbackOrigin=paymentOrigins(env).api;
 let paymentId=order.quickpayPaymentId;
 if(!paymentId){await updateCheckout(id,current=>{current.status='payment_setup';current.quickpayOrderId=qpOrderId;return current;});let payment;try{payment=await request('/payments',{method:'POST',body:{order_id:qpOrderId,currency:'DKK'},env,fetchImpl});}catch(error){await updateCheckout(id,current=>{current.status='payment_setup_uncertain';current.events.push({at:new Date().toISOString(),type:'quickpay_create_uncertain',message:error.message});return current;});throw Error('Quickpay-betalingen kræver afstemning før nyt forsøg.');}if(!Number.isSafeInteger(payment.id)||payment.order_id!==qpOrderId)throw Error('Quickpay returnerede ikke et entydigt betalings-id.');paymentId=payment.id;await updateCheckout(id,current=>{current.quickpayPaymentId=paymentId;current.quickpayOrderId=qpOrderId;return current;});}
 const link=await request(`/payments/${paymentId}/link`,{method:'PUT',body:{amount:order.totalIncVat,language:'da',auto_capture:false,auto_fee:false,payment_methods:isAdminLiveTest(order)?'mobilepay':order.adminTest?'creditcard':env.QUICKPAY_PAYMENT_METHODS||'mobilepay,apple-pay,google-pay,creditcard',continue_url:`${url}/ordre?checkout=${encodeURIComponent(id)}`,cancel_url:`${url}/betaling?annulleret=1${isAdminLiveTest(order)?'&test=live':order.adminTest?'&test=1':''}`,callback_url:`${callbackOrigin}/api/quickpay/callback`,customer_email:order.shipping.email},env,fetchImpl});
 if(!/^https:\/\/payment\.quickpay\.net\/payments\//.test(link.url||''))throw Error('Quickpay returnerede ikke et sikkert betalingslink.');
 await updateCheckout(id,current=>{current.status='awaiting_payment';current.paymentMode=isAdminLiveTest(order)?'live':config.mode;current.quickpayLinkUrl=link.url;current.events.push({at:new Date().toISOString(),type:'quickpay_link_created',paymentId});return current;});return {id,paymentId,url:link.url};
}
export async function applyQuickpayCallback(payment,{env=process.env}={}){const order=(await listCheckouts()).find(row=>row.paymentProvider==='quickpay'&&row.quickpayOrderId===payment.order_id&&row.quickpayPaymentId===payment.id);if(!order)return null;if(order.adminTest&&!isAdminLiveTest(order)&&payment.test_mode!==true)throw Error('Betalingstesten kræver et QuickPay-testkort.');assertPaymentMode(payment,env,order);return updateCheckout(order.id,current=>{
 if(current.quickpayPaymentId!==payment.id||current.quickpayOrderId!==payment.order_id)throw Error('Quickpay-betalingen matcher ikke ordren.');const state=quickpayPaymentState(payment,current.totalIncVat);if(state==='invalid')throw Error('Quickpay-beløb eller valuta matcher ikke ordren.');const operation=payment.operations?.at(-1),key=operation?`quickpay-${payment.id}-${operation.id}`:null;if(key&&current.events.some(event=>event.id===key))return current;
 const at=new Date().toISOString();const totals=quickpayTotals(payment);current.paymentTotals={captured:totals.captured,refunded:totals.refunded};if(state==='partially_paid'){current.status='partially_paid';}else if(state==='paid'){current.status='paid';current.paidAt=current.paidAt||last(payment,'capture')?.created_at||at;}else if(state==='authorized'&&current.status==='cancelled')current.status='needs_attention';else if(state==='authorized'&&['awaiting_payment','payment_setup','authorized'].includes(current.status)){current.status='authorized';current.paymentMode=isAdminLiveTest(current)||env.QUICKPAY_MODE==='live'?'live':'test';current.authorizedAt=current.authorizedAt||at;const hours=Number(env.QUICKPAY_AUTH_HOLD_HOURS||24),authorizedAt=Date.parse(last(payment,'authorize')?.created_at||at);if(!current.authorizationExpiresAt&&hours>0&&hours<=168&&Number.isFinite(authorizedAt))current.authorizationExpiresAt=new Date(authorizedAt+hours*3600000).toISOString();const window=quickpayCaptureWindow(current,payment,{env});if(window.policy==='clearhaus-179-days'&&window.expiresAt){current.authorizationExpiresAt=window.expiresAt;current.captureDeadlinePolicy=window.policy;current.lateCapture=window.lateCapture;}}else if(state==='cancelled'&&!['paid','cancelled'].includes(current.status))current.status='authorization_expired';else if(state==='failed'&&current.status==='awaiting_payment')current.status='payment_failed';if(key)current.events.push({id:key,at,type:`quickpay_${state}`});return current;
 });}
export async function getQuickpayPayment(order,{env=process.env,fetchImpl=fetch}={}){if(!Number.isSafeInteger(order.quickpayPaymentId))throw Error('Quickpay-betalingsnummer mangler.');const payment=await request(`/payments/${order.quickpayPaymentId}`,{env,fetchImpl});assertPaymentMode(payment,env,order);if(payment.id!==order.quickpayPaymentId||payment.order_id!==order.quickpayOrderId||quickpayPaymentState(payment,order.totalIncVat)==='invalid')throw Error('Quickpay-betalingen matcher ikke ordren.');
 const window=quickpayCaptureWindow(order,payment,{env});
 if(window.policy==='clearhaus-179-days'&&window.expiresAt&&quickpayPaymentState(payment,order.totalIncVat)==='authorized')await updateCheckout(order.id,current=>{if(current.quickpayPaymentId===payment.id&&current.status==='authorized'){current.authorizationExpiresAt=window.expiresAt;current.captureDeadlinePolicy=window.policy;current.lateCapture=window.lateCapture;}return current;});
 return payment;}
export async function captureQuickpay(id,{env=process.env,fetchImpl=fetch,canCapture=async()=>true,now=Date.now()}={}){
 const order=await readCheckout(id);if(order.adminTest)throw Error('Administratorens betalingstest må ikke hæves.');if(order.status==='paid')return order;if(order.status!=='authorized'&&order.status!=='capture_reconciliation')throw Error('Ordren har ingen aktiv reservation.');if(!await canCapture(order))throw Error('Hævning er ikke godkendt. Kontroller korrekturgodkendelse eller dokumenteret afsendelse.');const payment=await getQuickpayPayment(order,{env,fetchImpl}),state=quickpayPaymentState(payment,order.totalIncVat);if(state==='paid'){return updateCheckout(id,current=>{current.status='paid';current.paidAt=current.paidAt||new Date(now).toISOString();return current;});}if(quickpayTotals(payment).refunded)throw Error('Refundering har lukket transaktionen. Afstem restordren.');if(order.status==='capture_reconciliation')throw Error('Hævningen skal afstemmes hos Quickpay før et nyt kald.');if(state!=='authorized'||!quickpayCaptureWindow(order,payment,{env,now}).valid){await updateCheckout(id,current=>{current.status='authorization_expired';return current;});throw Error('Reservationen er udløbet eller dækker ikke ordren. Kunden skal godkende betaling igen.');}
 await updateCheckout(id,current=>{if(current.status!=='authorized')throw Error('Hævningen er allerede startet eller kræver afstemning.');current.status='capture_reconciliation';current.events.push({at:new Date().toISOString(),type:'quickpay_capture_requested'});return current;});let result;try{result=await request(`/payments/${payment.id}/capture`,{method:'POST',body:{amount:order.totalIncVat},env,fetchImpl});}catch(error){throw Error(`Hævningen kræver afstemning hos Quickpay: ${error.message}`);}assertPaymentMode(result,env);if(quickpayPaymentState(result,order.totalIncVat)!=='paid')throw Error('Hævningen afventer Quickpay-kvittering og skal afstemmes.');return updateCheckout(id,current=>{current.status='paid';current.paidAt=new Date().toISOString();current.events.push({at:current.paidAt,type:'quickpay_captured'});return current;});
}
const cancellationLocks=new Map();
export async function cancelQuickpay(id,options={}){
 if(cancellationLocks.has(id))return cancellationLocks.get(id);
 const task=cancelQuickpayLocked(id,options);cancellationLocks.set(id,task);
 try{return await task;}finally{if(cancellationLocks.get(id)===task)cancellationLocks.delete(id);}
}
async function cancelQuickpayLocked(id,{env=process.env,fetchImpl=fetch}={}){
 const order=await readCheckout(id);
 if(order.status==='cancelled')return order;
 if(['paid','capture_reconciliation','needs_attention'].includes(order.status)||order.paidAt)throw Error('Hævet eller uafklaret betaling kræver manuel afstemning.');
 async function inspect(){
  const payment=await request(`/payments/${order.quickpayPaymentId}`,{env,fetchImpl});
  assertPaymentMode(payment,env,order);
  if(payment.id!==order.quickpayPaymentId||payment.order_id!==order.quickpayOrderId||payment.type!=='Payment'||String(payment.currency).toUpperCase()!=='DKK'||(payment.link&&Number(payment.link.amount)!==order.totalIncVat))throw Error('Quickpay-betalingen matcher ikke ordren.');
  if((payment.operations||[]).some(o=>o.type==='capture'&&successful(o)))throw Error('Quickpay-betalingen er helt eller delvist hævet. Afstem betalingen manuelt.');
  if((payment.operations||[]).some(o=>o.pending))throw Error('Quickpay behandler en betaling. Afvent resultatet før annullering.');
  const cancelled=successful(last(payment,'cancel')),authorization=last(payment,'authorize');
  if(!cancelled&&successful(authorization)&&(authorization.amount!==order.totalIncVat||payment.accepted!==true))throw Error('Quickpay-reservationen kræver manuel afstemning.');
  return {payment,authorized:!cancelled&&successful(authorization),cancelled};
 }
 if(order.quickpayPaymentId){
  if(!Number.isSafeInteger(order.quickpayPaymentId))throw Error('Quickpay-betalingsnummer mangler.');
  let current=await inspect();
  // Official v10 API: DELETE /payments/{id}/link returns 204. It closes the
  // hosted link without deleting payment history, capturing or refunding money.
  if(current.payment.link){await request(`/payments/${order.quickpayPaymentId}/link`,{method:'DELETE',env,fetchImpl});current=await inspect();}
  // An authorization may have completed while the link was being closed.
  if(current.authorized){await request(`/payments/${order.quickpayPaymentId}/cancel?synchronized`,{method:'POST',body:{},env,fetchImpl});current=await inspect();if(!current.cancelled)throw Error('Quickpay-annulleringen afventer bekræftelse. Prøv igen efter afstemning.');}
 }
 return updateCheckout(id,current=>{
  if(current.status==='cancelled')return current;
  if(['paid','capture_reconciliation','needs_attention'].includes(current.status)||current.paidAt||current.quickpayPaymentId!==order.quickpayPaymentId||current.quickpayOrderId!==order.quickpayOrderId)throw Error('Betalingen er ændret under annulleringen. Afstem først.');
  current.status='cancelled';current.quickpayLinkClosedAt=new Date().toISOString();delete current.quickpayLinkUrl;
  current.events.push({at:current.quickpayLinkClosedAt,type:'cancelled',pfCancellationRequired:Boolean(current.pfOrderIds?.length)});return current;
 });
}

export async function renewQuickpay(id,{env=process.env,fetchImpl=fetch,validate=async()=>{}}={}){const order=await readCheckout(id);if(order.adminTest)throw Error('Start en ny administratortest.');if(!['authorization_expired','expired','payment_failed'].includes(order.status))throw Error('Ordren er ikke klar til ny reservation.');await validate(order);if(order.quickpayPaymentId){const payment=await getQuickpayPayment(order,{env,fetchImpl}),state=quickpayPaymentState(payment,order.totalIncVat);if(['paid','partially_paid'].includes(state))throw Error('Betalingen er helt eller delvist hævet og skal afstemmes før ny reservation.');if(['pending','failed'].includes(state)){if(!order.quickpayLinkUrl)throw Error('Quickpay-linket skal afstemmes før nyt forsøg.');await updateCheckout(id,current=>{current.status='awaiting_payment';return current;});return {id,paymentId:order.quickpayPaymentId,url:order.quickpayLinkUrl};}if(state==='authorized'){const result=await request(`/payments/${payment.id}/cancel`,{method:'POST',body:{},env,fetchImpl});if(quickpayPaymentState(result,order.totalIncVat)!=='cancelled')throw Error('Den gamle reservation kunne ikke frigives.');}}await updateCheckout(id,current=>{current.previousQuickpayPaymentIds=[...(current.previousQuickpayPaymentIds||[]),current.quickpayPaymentId].filter(Boolean);current.paymentAttempt=(current.paymentAttempt||0)+1;current.quickpayPaymentId=null;current.quickpayOrderId=null;current.quickpayLinkUrl=null;current.authorizedAt=null;current.authorizationExpiresAt=null;current.status='prepared';return current;});return createQuickpayLink(id,{env,fetchImpl});}

export async function quickpayOperation(paymentId,kind,amount,options={}){if(!Number.isSafeInteger(paymentId)||!['capture','refund'].includes(kind)||!Number.isSafeInteger(amount)||amount<=0)throw Error('Ugyldig betalingsoperation.');return request(`/payments/${paymentId}/${kind}`,{...options,method:'POST',body:{amount}});}
