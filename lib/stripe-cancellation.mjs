// Provider-only half of cancellation. The caller persists its intent first and
// merges this verified result into a fresh checkout without holding its lock.
export async function closeStripePayment(order,{env=process.env,fetchImpl=fetch}={}){
 const evidence={sessionId:order.stripeSessionId||null,paymentIntentId:order.stripePaymentIntentId||null};
 const fail=message=>{const error=Error(message);error.stripeEvidence={...evidence};throw error;};
 async function request(path,{method='GET',key}={}){
  const response=await fetchImpl('https://api.stripe.com/v1/'+path,{method,headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,...(key?{'Idempotency-Key':key}:{})},signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw Error('Stripe-annulleringen kunne ikke bekræftes.');return data;
 }
 const live=order.stripeSessionId?.startsWith('cs_live_')??order.paymentMode==='live';
 function intentId(session){const id=typeof session.payment_intent==='object'?session.payment_intent?.id:session.payment_intent;if(id&&!/^pi_[a-zA-Z0-9]+$/.test(id))fail('Stripe returnerede et ugyldigt betalings-id.');return id||null;}
 function checkSession(session){
  if(session.id!==order.stripeSessionId||session.livemode!==live||session.mode!=='payment'||session.currency!=='dkk'||session.amount_total!==order.totalIncVat||session.metadata?.checkout_id&&session.metadata.checkout_id!==order.id||session.client_reference_id&&session.client_reference_id!==order.id||!['open','complete','expired'].includes(session.status))fail('Stripe-sessionen matcher ikke ordren.');
  const id=intentId(session);if(id&&evidence.paymentIntentId&&id!==evidence.paymentIntentId)fail('Stripe-betalingen er ændret under annulleringen.');
  if(id)evidence.paymentIntentId=id;evidence.sessionStatus=session.status;evidence.sessionPaymentStatus=session.payment_status;
  if(session.payment_status==='paid')fail('Stripe-sessionen er betalt. Afstem betalingen manuelt.');
  return session;
 }
 function checkIntent(intent){
  if(intent.id!==evidence.paymentIntentId||intent.livemode!==live||intent.currency!=='dkk'||intent.amount!==order.totalIncVat||intent.metadata?.checkout_id&&intent.metadata.checkout_id!==order.id)fail('Stripe-betalingen matcher ikke ordren.');
  evidence.intentStatus=intent.status;
  if(Number.isSafeInteger(intent.amount_received)&&intent.amount_received>0)evidence.amountReceived=intent.amount_received;
  if(intent.status==='succeeded'||evidence.amountReceived)fail('Betalingen er helt eller delvist hævet. Afstem og refundér manuelt.');
  return intent;
 }
 try{
  if(order.stripeSessionId){
   const path='checkout/sessions/'+encodeURIComponent(order.stripeSessionId);let session=checkSession(await request(path));
   if(session.status==='open'){
    // Completion can win over expiry; even an HTTP error or lost response must
    // be followed by a fresh session read before any local cancellation.
    try{await request(path+'/expire',{method:'POST',key:'smerch-expire-'+order.stripeSessionId});}catch{}
    session=checkSession(await request(path));if(session.status==='open')fail('Stripe-sessionen er stadig åben. Annulleringen kræver afstemning.');
   }
   if(session.status==='complete'&&!evidence.paymentIntentId)fail('Den afsluttede Stripe-session mangler en verificerbar betaling.');
  }
  if(evidence.paymentIntentId){
   const path='payment_intents/'+encodeURIComponent(evidence.paymentIntentId);let intent=checkIntent(await request(path));
   if(intent.status==='requires_capture'){
    // Stripe permits direct cancellation of a Checkout intent in requires_capture.
    try{await request(path+'/cancel',{method:'POST',key:'smerch-cancel-'+intent.id});}catch{}
    intent=checkIntent(await request(path));
   }
   if(intent.status!=='canceled')fail('Stripe-betalingen er ikke bekræftet annulleret. Afstem først.');
  }
  return evidence;
 }catch(error){error.stripeEvidence??={...evidence};throw error;}
}
