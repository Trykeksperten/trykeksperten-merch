import {quickpayMethodSetting,validateQuickpayMethod} from './quickpay-methods.mjs';
import {quickpayCaptureWindow} from './quickpay-capture-policy.mjs';
import {quickpayTotals} from './sales-finance.mjs';
import {assertAdminCheckoutTest,assertAdminLiveTest,isAdminLiveTest,assertAdminPilot} from './admin-checkout-test.mjs';
import {paymentOrigins} from './payment-origin.mjs';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {checkoutConfiguration,listCheckouts,readCheckout,updateCheckout} from './checkout.mjs';
import {withOrderAggregateLock} from './order-aggregate-lock.mjs';
import {claimPaymentOperation} from './payment-operation-claim.mjs';

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
const setupLocks=new Map();
async function withPaymentSetup(id,task){
 const previous=setupLocks.get(id)||Promise.resolve();let release;const pending=new Promise(resolve=>{release=resolve;});setupLocks.set(id,pending);await previous;
 try{return await task();}finally{release();if(setupLocks.get(id)===pending)setupLocks.delete(id);}
}
const validLink=url=>typeof url==='string'&&/^https:\/\/payment\.quickpay\.net\/payments\/[a-zA-Z0-9_-]+$/.test(url);
function sameAttempt(current,order){if(current.paymentProvider!=='quickpay'||(current.paymentAttempt||0)!==(order.paymentAttempt||0)||current.totalIncVat!==order.totalIncVat)throw Error('Betalingsforsøget er ændret. Afstem før nyt forsøg.');}
async function setupUncertain(id,order,error){
 return updateCheckout(id,current=>{sameAttempt(current,order);current.quickpaySetup={...current.quickpaySetup,phase:'uncertain',error:String(error.message).slice(0,180)};if(['prepared','payment_setup','awaiting_payment'].includes(current.status))current.status='payment_setup_uncertain';current.events.push({at:new Date().toISOString(),type:'quickpay_setup_uncertain',message:String(error.message).slice(0,180)});return current;});
}
export async function createQuickpayLink(id,options={}){return withPaymentSetup(id,()=>createQuickpayLinkLocked(id,options));}
async function createQuickpayLinkLocked(id,{env=process.env,fetchImpl=fetch}={}){
 const order=await readCheckout(id);if(order.adminPilot)assertAdminPilot(true,env);if(order.adminLiveTest&&!isAdminLiveTest(order))throw Error('Ugyldig live-test.');if(isAdminLiveTest(order))assertAdminLiveTest(true,env);else if(order.adminTest)assertAdminCheckoutTest(true,env);
 const config=checkoutConfiguration({...env,PAYMENT_PROVIDER:'quickpay'});if(order.paymentProvider!=='quickpay'||!config.ready)throw Error(config.reason||'Quickpay er ikke valgt.');
 const framed=order.quickpayFramed===true&&order.quickpayMethod==='creditcard'&&!order.adminTest;
 if(order.status==='awaiting_payment'&&order.quickpaySetup?.phase==='ready'&&validLink(order.quickpayLinkUrl))return {id,paymentId:order.quickpayPaymentId,url:order.quickpayLinkUrl,...(framed?{framed:true}:{})};
 if(!['prepared','payment_setup'].includes(order.status)||order.quickpaySetup?.phase==='uncertain')throw Error('Betalingen kan ikke startes igen uden afstemning.');
 const paymentMethods=isAdminLiveTest(order)?'mobilepay':order.adminTest?'creditcard':order.quickpayMethod?validateQuickpayMethod(order.quickpayMethod,env):quickpayMethodSetting(env);
 const attempt=order.paymentAttempt||0,qpOrderId=paymentOrderId(id,attempt),mode=isAdminLiveTest(order)?'live':config.mode,url=paymentOrigins(env).customer,callbackOrigin=paymentOrigins(env).api;
 let paymentId=order.quickpayPaymentId;
 if(!paymentId){
  // Old payment_setup snapshots may already have sent POST without saving its id.
  if(order.status==='payment_setup'||order.quickpaySetup)throw Error('Quickpay-oprettelsen kræver afstemning før nyt forsøg.');
  await claimPaymentOperation(id,attempt,'quickpay-create',{orderId:qpOrderId,amount:order.totalIncVat,mode});
  await updateCheckout(id,current=>{sameAttempt(current,order);if(current.status!=='prepared'||current.quickpayPaymentId)throw Error('Betalingen er ændret før oprettelsen.');current.status='payment_setup';current.quickpayOrderId=qpOrderId;current.quickpaySetup={attempt,orderId:qpOrderId,amount:order.totalIncVat,mode,phase:'create_requested'};return current;});
  try{
   const payment=await request('/payments',{method:'POST',body:{order_id:qpOrderId,currency:'DKK'},env,fetchImpl});
   if(!Number.isSafeInteger(payment?.id)||payment.id<=0||payment.order_id!==qpOrderId)throw Error('Quickpay returnerede ikke et entydigt betalings-id.');
   paymentId=payment.id;
   await updateCheckout(id,current=>{sameAttempt(current,order);if(current.status!=='payment_setup'||current.quickpayOrderId!==qpOrderId||current.quickpayPaymentId)throw Error('Betalingen er ændret under oprettelsen.');current.quickpayPaymentId=paymentId;current.quickpaySetup.phase='created';current.quickpaySetup.paymentId=paymentId;return current;});
  }catch(error){await setupUncertain(id,order,error);throw Error('Quickpay-betalingen kræver afstemning før nyt forsøg.');}
 }
 if(!Number.isSafeInteger(paymentId)||paymentId<=0||order.quickpayOrderId&&order.quickpayOrderId!==qpOrderId)throw Error('Quickpay-betalingsforsøget kræver afstemning.');
 await claimPaymentOperation(id,attempt,'quickpay-link',{orderId:qpOrderId,paymentId,amount:order.totalIncVat,mode});
 await updateCheckout(id,current=>{sameAttempt(current,order);if(current.status!=='payment_setup'||current.quickpayPaymentId!==paymentId||current.quickpayOrderId!==qpOrderId)throw Error('Betalingen er ændret før linkoprettelsen.');current.quickpaySetup={...current.quickpaySetup,attempt,orderId:qpOrderId,paymentId,amount:order.totalIncVat,mode,phase:'link_requested'};return current;});
 try{
  const link=await request(`/payments/${paymentId}/link`,{method:'PUT',body:{amount:order.totalIncVat,language:'da',auto_capture:false,auto_fee:false,...(framed?{framed:true}:{}),payment_methods:paymentMethods,continue_url:`${url}/ordre?checkout=${encodeURIComponent(id)}`,cancel_url:`${url}/betaling?annulleret=1${isAdminLiveTest(order)?'&test=live':order.adminTest?'&test=1':''}`,callback_url:`${callbackOrigin}/api/quickpay/callback`,customer_email:order.shipping.email},env,fetchImpl});
  if(!validLink(link?.url))throw Error('Quickpay returnerede ikke et sikkert betalingslink.');
  await updateCheckout(id,current=>{sameAttempt(current,order);if(current.quickpayPaymentId!==paymentId||current.quickpayOrderId!==qpOrderId||!['payment_setup','awaiting_payment','authorized','paid','partially_paid','payment_failed'].includes(current.status))throw Error('Betalingen er ændret under linkoprettelsen.');if(current.status==='payment_setup')current.status='awaiting_payment';current.paymentMode=mode;current.quickpayLinkUrl=link.url;current.quickpaySetup.phase='ready';current.events.push({at:new Date().toISOString(),type:'quickpay_link_created',paymentId});return current;});
  return {id,paymentId,url:link.url,...(framed?{framed:true}:{})};
 }catch(error){await setupUncertain(id,order,error);throw Error('Quickpay-linket kræver afstemning før nyt forsøg.');}
}
export function quickpayMethod(payment){
 const metadata=payment.metadata||{},origin=String(metadata.origin||'').toLowerCase(),brand=String(metadata.brand||'').toLowerCase(),type=String(metadata.type||'').toLowerCase();
 const wallets={'mobilepay':'MobilePay','mobilepay-online':'MobilePay','apple-pay':'Apple Pay','apple_pay':'Apple Pay','google-pay':'Google Pay','google_pay':'Google Pay'};
 for(const value of [origin,type,brand])if(wallets[value])return wallets[value];
 const cards={visa:'Visa',mastercard:'Mastercard',dankort:'Dankort','visa-dankort':'Visa/Dankort',maestro:'Maestro',americanexpress:'American Express'};
 return cards[brand]|| (type==='card'?'Betalingskort':null);
}
export function paymentStatusSummary(order){return {id:order.id,status:order.status,paymentProvider:order.paymentProvider,paymentMethod:order.paymentMethod||null,paymentStatusReceivedAt:order.paymentStatusReceivedAt||null,paymentCheckedAt:order.paymentCheckedAt||null,paymentCheckSource:order.paymentCheckSource||null};}
export async function refreshQuickpayStatus(id,options={}){
 const order=await readCheckout(id);
 if(order.paymentProvider!=='quickpay')throw Error('Statuskontrol understøtter kun Quickpay-betalinger.');
 // A historical status lookup follows the server-recorded order mode. The
 // shop may have returned to test mode after a real pilot order was placed.
 // Keep capture/cancellation and ordinary callback guards unchanged.
 const mode=['live','test'].includes(order.paymentMode)?order.paymentMode:(order.adminPilot||isAdminLiveTest(order)?'live':null);
 const lookupOptions=mode?{...options,env:{...(options.env||process.env),QUICKPAY_MODE:mode}}:options;
 const payment=await getQuickpayPayment(order,lookupOptions);
 const updated=await applyQuickpayCallback(payment,lookupOptions);
 if(!updated)throw Error('Betalingen kunne ikke knyttes til ordren.');
 return updateCheckout(id,current=>{
  if(current.quickpayPaymentId!==payment.id)throw Error('Betalingen er ændret. Kontrollér status igen.');
  current.paymentMethod=quickpayMethod(payment);current.paymentCheckedAt=new Date().toISOString();current.paymentCheckSource='api';
  return current;
 });
}

export async function applyQuickpayCallback(payment,options={}){
 const order=(await listCheckouts()).find(row=>row.paymentProvider==='quickpay'&&row.quickpayOrderId===payment.order_id&&row.quickpayPaymentId===payment.id);if(!order)return null;
 return applyQuickpayPayment(order.id,payment,options);
}
export async function applyQuickpayPayment(id,payment,{env=process.env}={}){
 const order=await readCheckout(id);
 if(order.adminTest&&!isAdminLiveTest(order)&&payment.test_mode!==true)throw Error('Betalingstesten kræver et QuickPay-testkort.');assertPaymentMode(payment,env,order);
 return updateCheckout(order.id,current=>{
  if(current.paymentProvider!=='quickpay'||current.quickpayPaymentId!==payment.id||current.quickpayOrderId!==payment.order_id)throw Error('Quickpay-betalingen matcher ikke ordren.');
  const state=quickpayPaymentState(payment,current.totalIncVat);if(state==='invalid')throw Error('Quickpay-beløb eller valuta matcher ikke ordren.');
  const at=new Date().toISOString(),totals=quickpayTotals(payment),operations=(payment.operations||[]).map(o=>({id:o.id,type:o.type,amount:o.amount,pending:Boolean(o.pending),status:String(o.qp_status_code)})).sort((a,b)=>a.id-b.id);
  const finalId=operations.filter(o=>!o.pending&&Number.isSafeInteger(o.id)).reduce((n,o)=>Math.max(n,o.id),0),prior=current.quickpayObservation?.paymentId===payment.id?current.quickpayObservation:null;
  current.paymentMethod=quickpayMethod(payment);current.paymentStatusReceivedAt=at;
  // GET can observe a pending operation and callbacks can arrive out of order.
  // Dedupe the resource state, never consume a final operation's key while pending.
  if(prior&&finalId<prior.finalOperationId||totals.captured<(current.paymentTotals?.captured||0)||totals.refunded<(current.paymentTotals?.refunded||0)||current.status==='paid'&&state==='partially_paid')return current;
  const digest=createHash('sha256').update(JSON.stringify({accepted:payment.accepted,operations,state})).digest('hex').slice(0,24),key=`quickpay-${payment.id}-state-${digest}`;
  if(current.events.some(event=>event.id===key))return current;
  current.quickpayObservation={paymentId:payment.id,finalOperationId:Math.max(prior?.finalOperationId||0,finalId)};
  current.paymentTotals={captured:totals.captured,refunded:totals.refunded};
  if(state==='partially_paid')current.status='partially_paid';
  else if(state==='paid'){current.status='paid';current.paidAt=current.paidAt||last(payment,'capture')?.created_at||at;}
  else if(state==='authorized'&&current.status==='cancelled')current.status='needs_attention';
  else if(state==='authorized'&&['awaiting_payment','payment_setup','authorized'].includes(current.status)){
   current.status='authorized';current.paymentMode=isAdminLiveTest(current)||env.QUICKPAY_MODE==='live'?'live':'test';current.authorizedAt=current.authorizedAt||at;
   const hours=Number(env.QUICKPAY_AUTH_HOLD_HOURS||24),authorizedAt=Date.parse(last(payment,'authorize')?.created_at||at);if(!current.authorizationExpiresAt&&hours>0&&hours<=168&&Number.isFinite(authorizedAt))current.authorizationExpiresAt=new Date(authorizedAt+hours*3600000).toISOString();
   const window=quickpayCaptureWindow(current,payment,{env});if(window.policy==='clearhaus-179-days'&&window.expiresAt){current.authorizationExpiresAt=window.expiresAt;current.captureDeadlinePolicy=window.policy;current.lateCapture=window.lateCapture;}
  }else if(state==='cancelled'&&!['paid','cancelled'].includes(current.status))current.status='authorization_expired';
  else if(state==='failed'&&['awaiting_payment','payment_setup'].includes(current.status))current.status='payment_failed';
  current.events.push({id:key,at,type:`quickpay_${state}`,pending:totals.pending});return current;
 });
}
export async function getQuickpayPayment(order,{env=process.env,fetchImpl=fetch}={}){if(!Number.isSafeInteger(order.quickpayPaymentId))throw Error('Quickpay-betalingsnummer mangler.');const payment=await request(`/payments/${order.quickpayPaymentId}`,{env,fetchImpl});assertPaymentMode(payment,env,order);if(payment.id!==order.quickpayPaymentId||payment.order_id!==order.quickpayOrderId||quickpayPaymentState(payment,order.totalIncVat)==='invalid')throw Error('Quickpay-betalingen matcher ikke ordren.');
 const window=quickpayCaptureWindow(order,payment,{env});
 if(window.policy==='clearhaus-179-days'&&window.expiresAt&&quickpayPaymentState(payment,order.totalIncVat)==='authorized')await updateCheckout(order.id,current=>{if(current.quickpayPaymentId===payment.id&&current.status==='authorized'){current.authorizationExpiresAt=window.expiresAt;current.captureDeadlinePolicy=window.policy;current.lateCapture=window.lateCapture;}return current;});
 return payment;}
export async function captureQuickpay(id,{env=process.env,fetchImpl=fetch,canCapture=async()=>true,now}={}){
 const order=await readCheckout(id);
 if(order.adminTest)throw Error('Administratorens betalingstest må ikke hæves.');
 if(order.status==='paid')return order;
 if(!['authorized','capture_reconciliation'].includes(order.status))throw Error('Ordren har ingen aktiv reservation.');
 if(!await canCapture(order))throw Error('Hævning er ikke godkendt. Kontroller korrekturgodkendelse eller dokumenteret afsendelse.');
 const payment=await getQuickpayPayment(order,{env,fetchImpl});
 // The provider read may take seconds. A proof imported during it must win
 // before capture; proof mutations and the final capture decision use one lock.
 return withOrderAggregateLock(id,async()=>{
  const current=await readCheckout(id),checkedAt=now??Date.now();
  const assertSamePayment=value=>{if(value.quickpayPaymentId!==order.quickpayPaymentId||value.quickpayOrderId!==order.quickpayOrderId||value.totalIncVat!==order.totalIncVat)throw Error('Betalingen er ændret under kontrollen. Kontrollér igen før hævning.');};
  assertSamePayment(current);
  const state=quickpayPaymentState(payment,current.totalIncVat);
  if(state==='paid')return updateCheckout(id,value=>{assertSamePayment(value);value.status='paid';value.paidAt=value.paidAt||new Date(checkedAt).toISOString();return value;});
  if(quickpayTotals(payment).refunded)throw Error('Refundering har lukket transaktionen. Afstem restordren.');
  if(current.status==='capture_reconciliation')throw Error('Hævningen skal afstemmes hos Quickpay før et nyt kald.');
  if(current.adminTest||current.status!=='authorized')throw Error('Hævningen er allerede startet eller kræver afstemning.');
  if(state!=='authorized'||!quickpayCaptureWindow(current,payment,{env,now:checkedAt}).valid){
   await updateCheckout(id,value=>{assertSamePayment(value);if(value.status!=='authorized')throw Error('Betalingen er ændret under kontrollen.');value.status='authorization_expired';return value;});
   throw Error('Reservationen er udløbet eller dækker ikke ordren. Kunden skal godkende betaling igen.');
  }
  if(!await canCapture(current))throw Error('Hævning er ikke godkendt. Kontroller korrekturgodkendelse eller dokumenteret afsendelse.');
  await updateCheckout(id,value=>{assertSamePayment(value);if(value.status!=='authorized')throw Error('Hævningen er allerede startet eller kræver afstemning.');value.status='capture_reconciliation';value.events.push({at:new Date().toISOString(),type:'quickpay_capture_requested'});return value;});
  let result;
  try{result=await request(`/payments/${payment.id}/capture`,{method:'POST',body:{amount:current.totalIncVat},env,fetchImpl});}
  catch(error){throw Error(`Hævningen kræver afstemning hos Quickpay: ${error.message}`);}
  assertPaymentMode(result,env);
  if(result.id!==payment.id||result.order_id!==payment.order_id||quickpayPaymentState(result,current.totalIncVat)!=='paid')throw Error('Hævningen afventer Quickpay-kvittering og skal afstemmes.');
  return updateCheckout(id,value=>{assertSamePayment(value);value.status='paid';value.paidAt=new Date().toISOString();value.events.push({at:value.paidAt,type:'quickpay_captured'});return value;});
 });
}
export async function cancelQuickpay(id,options={}){return withPaymentSetup(id,()=>cancelQuickpayLocked(id,options));}
async function cancelQuickpayLocked(id,{env=process.env,fetchImpl=fetch}={}){
 const order=await readCheckout(id);
 if(order.status==='cancelled')return order;
 if(['payment_setup','payment_setup_uncertain','payment_renewal'].includes(order.status)||order.quickpaySetup&&order.quickpaySetup.phase!=='ready'||['requested','uncertain'].includes(order.quickpayRenewal?.status))throw Error('Betalingsoprettelsen eller fornyelsen kræver afstemning før annullering.');
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

export async function renewQuickpay(id,options={}){return withPaymentSetup(id,()=>renewQuickpayLocked(id,options));}
async function renewQuickpayLocked(id,{env=process.env,fetchImpl=fetch,validate=async()=>{}}={}){
 const order=await readCheckout(id);if(order.adminTest)throw Error('Start en ny administratortest.');
 if(order.status==='awaiting_payment'&&validLink(order.quickpayLinkUrl))return {id,paymentId:order.quickpayPaymentId,url:order.quickpayLinkUrl};
 if(order.status==='prepared'&&order.quickpayRenewal?.status==='confirmed'&&order.quickpayRenewal.nextAttempt===order.paymentAttempt)return createQuickpayLinkLocked(id,{env,fetchImpl});
 if(!['authorization_expired','expired','payment_failed'].includes(order.status)||order.paidAt||['requested','uncertain'].includes(order.quickpayRenewal?.status))throw Error('Ordren er ikke klar til ny reservation. Afstem tidligere forsøg.');
 if(order.quickpayMethod)validateQuickpayMethod(order.quickpayMethod,env);
 await validate(order);if(!order.quickpayPaymentId)throw Error('Quickpay-betalingen mangler og skal afstemmes før ny reservation.');
 const payment=await getQuickpayPayment(order,{env,fetchImpl}),state=quickpayPaymentState(payment,order.totalIncVat),attempt=order.paymentAttempt||0;
 const assertCurrent=current=>{sameAttempt(current,order);if(current.quickpayPaymentId!==order.quickpayPaymentId||current.quickpayOrderId!==order.quickpayOrderId||current.paidAt||!['authorization_expired','expired','payment_failed','payment_renewal'].includes(current.status))throw Error('Betalingen er ændret under fornyelsen. Afstem først.');};
 if(['paid','partially_paid'].includes(state))throw Error('Betalingen er helt eller delvist hævet og skal afstemmes før ny reservation.');
 if(['pending','failed'].includes(state)){
  if(!validLink(order.quickpayLinkUrl))throw Error('Quickpay-linket skal afstemmes før nyt forsøg.');
  await updateCheckout(id,current=>{assertCurrent(current);current.status='awaiting_payment';return current;});return {id,paymentId:order.quickpayPaymentId,url:order.quickpayLinkUrl};
 }
 if(quickpayTotals(payment).pending||!['authorized','cancelled'].includes(state))throw Error('Quickpay behandler en operation. Afstem før ny reservation.');
 await claimPaymentOperation(id,attempt,'quickpay-renew',{paymentId:order.quickpayPaymentId,orderId:order.quickpayOrderId});
 await updateCheckout(id,current=>{assertCurrent(current);current.quickpayRenewal={status:'requested',attempt,paymentId:order.quickpayPaymentId,requestedAt:new Date().toISOString()};current.status='payment_renewal';return current;});
 try{
  if(state==='authorized'){
   await claimPaymentOperation(id,attempt,'quickpay-renew-cancel',{paymentId:payment.id,orderId:payment.order_id});
   await request(`/payments/${payment.id}/cancel?synchronized`,{method:'POST',body:{},env,fetchImpl});
   const fresh=await getQuickpayPayment(order,{env,fetchImpl});if(quickpayPaymentState(fresh,order.totalIncVat)!=='cancelled'||quickpayTotals(fresh).pending)throw Error('Den gamle reservation kunne ikke frigives.');
  }
  await updateCheckout(id,current=>{assertCurrent(current);current.previousQuickpayPaymentIds=[...new Set([...(current.previousQuickpayPaymentIds||[]),current.quickpayPaymentId].filter(Boolean))];current.paymentAttempt=attempt+1;current.quickpayPaymentId=null;current.quickpayOrderId=null;current.quickpayLinkUrl=null;current.authorizedAt=null;current.authorizationExpiresAt=null;current.quickpaySetup=null;current.quickpayObservation=null;current.quickpayRenewal={...current.quickpayRenewal,status:'confirmed',nextAttempt:attempt+1};current.status='prepared';return current;});
 }catch(error){
  await updateCheckout(id,current=>{sameAttempt(current,order);if(current.quickpayPaymentId!==order.quickpayPaymentId)throw Error('Betalingen er ændret under fornyelsen.');current.quickpayRenewal={...current.quickpayRenewal,status:'uncertain',error:String(error.message).slice(0,180)};if(['payment_renewal','authorization_expired','expired','payment_failed'].includes(current.status))current.status='payment_setup_uncertain';current.events.push({at:new Date().toISOString(),type:'quickpay_renew_uncertain',message:String(error.message).slice(0,180)});return current;});
  throw Error('Quickpay-fornyelsen kræver afstemning før nyt forsøg.');
 }
 return createQuickpayLinkLocked(id,{env,fetchImpl});
}

export async function quickpayOperation(paymentId,kind,amount,options={}){if(!Number.isSafeInteger(paymentId)||!['capture','refund'].includes(kind)||!Number.isSafeInteger(amount)||amount<=0)throw Error('Ugyldig betalingsoperation.');return request(`/payments/${paymentId}/${kind}`,{...options,method:'POST',body:{amount}});}
