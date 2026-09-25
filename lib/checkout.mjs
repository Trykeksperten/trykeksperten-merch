import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {dataPath} from './data-path.mjs';
import {sanitizeDesignLine} from './design-validation.mjs';
import {listPFStock,quotePFCart} from './pf-pricing.mjs';

const directory=()=>dataPath('checkouts');
const idPattern=/^pay-[a-f0-9-]{36}$/;
const file=id=>{if(!idPattern.test(id))throw Error('Ugyldigt betalingsnummer.');return resolve(directory(),`${id}.json`);};
const roundMoney=value=>{const n=Number(String(value).replace(',','.'));return Number.isFinite(n)&&n>=0?Math.round(n*100):null;};
const clean=(value,max=200)=>typeof value==='string'?value.trim().slice(0,max):'';
const save=async order=>{await mkdir(directory(),{recursive:true,mode:0o700});const target=file(order.id),tmp=`${target}.${randomUUID()}.tmp`;await writeFile(tmp,JSON.stringify(order),{mode:0o600});await rename(tmp,target);return order;};
const locks=new Map();
async function locked(id,fn){const prev=locks.get(id)||Promise.resolve();let release;const current=new Promise(resolve=>release=resolve);locks.set(id,current);await prev;try{return await fn();}finally{release();if(locks.get(id)===current)locks.delete(id);}}
export const readCheckout=async id=>JSON.parse(await readFile(file(id),'utf8'));
export async function listCheckouts(){try{return (await Promise.all((await readdir(directory())).filter(name=>/^pay-[a-f0-9-]{36}\.json$/.test(name)).map(name=>readCheckout(name.slice(0,-5))))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}catch(error){if(error.code==='ENOENT')return [];throw error;}}
export function checkoutPublic(order){return {id:order.id,status:order.status,totalIncVat:order.totalIncVat,currency:'DKK',createdAt:order.createdAt,authorizedAt:order.authorizedAt||null,paidAt:order.paidAt||null,authorizationExpiresAt:order.authorizationExpiresAt||null,pfOrderIds:order.pfOrderIds||[],shipment:order.shipment||null};}
export function checkoutConfiguration(env=process.env){
 if(env.PAYMENT_PROVIDER==='quickpay'){
  const base=env.SMERCH_PUBLIC_BASE_URL||'';let url;try{url=new URL(base);}catch{}
  const freightExVat=roundMoney(env.SMERCH_FREIGHT_EX_VAT_DKK),freightByLocation=Object.fromEntries(['PL','UK'].map(location=>[location,roundMoney(env[`SMERCH_FREIGHT_${location}_EX_VAT_DKK`])]).filter(([,amount])=>amount!==null&&amount>0));
  const live=env.QUICKPAY_MODE==='live',reason=!env.QUICKPAY_API_KEY?'Quickpay API-nøgle mangler.':!env.QUICKPAY_PRIVATE_KEY?'Quickpay privat callback-nøgle mangler.':!url||!['http:','https:'].includes(url.protocol)?'Webstedets offentlige adresse mangler.':live&&(url.protocol!=='https:'||env.QUICKPAY_LIVE_ENABLED!=='1'||env.QUICKPAY_CAPTURE_ENABLED!=='1'||env.PF_GATEWAY_MODE!=='live'||env.PF_GATEWAY_LIVE_ENABLED!=='1'||env.PF_AUTO_SUBMIT_ENABLED!=='1'||env.PF_WHITE_LABEL_CONFIRMED!=='1'||env.PF_PROOF_DELIVERY_CONFIRMED!=='1'||!(Number(env.QUICKPAY_AUTH_HOLD_HOURS)>0))?'Livebetaling kræver verificeret Quickpay/PF-integration, reservationsvindue og HTTPS.':(freightExVat===null||freightExVat<1)&&!Object.keys(freightByLocation).length?'Fragtpris mangler.':'';
  return {ready:!reason,reason,mode:live?'live':'test',provider:'quickpay',freightExVat,freightIncVat:freightExVat===null?null:freightExVat+Math.round(freightExVat*.25),freightByLocation};
 }
 const key=env.STRIPE_SECRET_KEY||'',webhook=env.STRIPE_WEBHOOK_SECRET||'',base=env.SMERCH_PUBLIC_BASE_URL||'',freightExVat=roundMoney(env.SMERCH_FREIGHT_EX_VAT_DKK);
 const freightByLocation=Object.fromEntries(['PL','UK'].map(location=>[location,roundMoney(env[`SMERCH_FREIGHT_${location}_EX_VAT_DKK`])]).filter(([,amount])=>amount!==null&&amount>0));
 const live=key.startsWith('sk_live_'),test=key.startsWith('sk_test_');let url;try{url=new URL(base);}catch{}
 const liveReady=env.STRIPE_LIVE_ENABLED==='1'&&url?.protocol==='https:'&&env.STRIPE_CAPTURE_ENABLED==='1'&&env.PF_GATEWAY_MODE==='live'&&env.PF_GATEWAY_LIVE_ENABLED==='1'&&env.PF_AUTO_SUBMIT_ENABLED==='1'&&env.PF_WHITE_LABEL_CONFIRMED==='1'&&env.PF_PROOF_DELIVERY_CONFIRMED==='1';
 const reason=!test&&!live?'Stripe-nøglen mangler.':!webhook.startsWith('whsec_')?'Stripe-webhook mangler.':!url||!['http:','https:'].includes(url.protocol)?'Webstedets offentlige adresse mangler.':live&&!liveReady?'Livebetaling kræver verificeret PF-overdragelse, korrektur, Smerch-forsendelse, manuel hævning og HTTPS.':(freightExVat===null||freightExVat<1)&&!Object.keys(freightByLocation).length?'Fragtpris mangler.':'';
 return {ready:!reason,reason,mode:live?'live':test?'test':'off',provider:'stripe',freightExVat,freightIncVat:freightExVat===null?null:freightExVat+Math.round(freightExVat*.25),freightByLocation};
}
export function validateDelivery(input){
 const shipping={name:clean(input?.name),email:clean(input?.email,254),phone:clean(input?.phone,40),company:clean(input?.company),street:clean(input?.street),postalCode:clean(input?.postalCode,12),city:clean(input?.city),country:'DK'};
 if(!shipping.name||!/^\S+@\S+\.\S+$/.test(shipping.email)||!shipping.phone||!shipping.street||!/^\d{4}$/.test(shipping.postalCode)||!shipping.city||input?.country!=='DK')throw Error('Udfyld navn, e-mail, telefon og en gyldig dansk leveringsadresse.');
 return shipping;
}
export function classifyFulfillment(catalog,lines){
 const groups=new Map(),unknown=[];
 for(const [index,line] of lines.entries()){
  const product=catalog.products.find(row=>row.id===line.productId),variant=product?.variants.find(row=>row.sku===line.sku);
  if(!variant){unknown.push(index);continue;}
  // The feed records the production site on decoration options, not on the
  // product itself. An undecorated item therefore has no verified dispatch site.
  const locations=new Set((line.decorations||[]).map(decoration=>variant.options.find(option=>option.id===decoration.optionId)?.productionLocation||''));
  if(locations.size!==1||locations.has('')){unknown.push(index);continue;}
  const location=[...locations][0];if(!groups.has(location))groups.set(location,[]);groups.get(location).push(index);
 }
 return {groups:[...groups].map(([location,lineIndexes])=>({location,lineIndexes})),unknownLineIndexes:unknown};
}
export function checkoutFulfillmentAssessment(catalog,lines,freightByLocation={}){
 const result=classifyFulfillment(catalog,lines);
 const message=result.unknownLineIndexes.length?'Produktionsstedet kan ikke bekræftes for alle varer. Vi skal afklare fragt, før betaling.':result.groups.length>1&&result.groups.some(group=>!freightByLocation[group.location])?'Varerne sendes fra flere produktionssteder og kræver separate PF-bestillinger og fragtpriser. Vi skal afklare begge fragter, før betaling.':result.groups.length?'':'Kurven mangler varer med et bekræftet produktionssted.';
 return {...result,ready:!message,message};
}
export function prepareCheckout(input,{catalog,prices,rules,stock,env=process.env,now=Date.now()}){
 const config=checkoutConfiguration(env);if(!config.ready)throw Error(config.reason);
 if(!Array.isArray(input?.lines)||!input.lines.length||input.lines.length>20)throw Error('Kurven skal indeholde 1–20 varer.');
 const lines=input.lines.map(line=>sanitizeDesignLine(catalog,line));
 const fulfillment=checkoutFulfillmentAssessment(catalog,lines,config.freightByLocation);if(!fulfillment.ready)throw Error(fulfillment.message);
 const quote=quotePFCart(catalog,lines,prices,rules,now);
 if(quote.totalIncVat===null||quote.totalIncVat<=0)throw Error(quote.message||'Prisen kan ikke fastlægges.');
 const availability=listPFStock(catalog,stock,now);if(!availability.available)throw Error(availability.message);
 const required=new Map();for(const line of lines)required.set(line.sku,(required.get(line.sku)||0)+line.quantity);
 for(const [sku,quantity] of required)if((availability.items[sku]?.available??0)<quantity)throw Error('Der er ikke nok varer på lager til denne ordre.');
 const shipping=validateDelivery(input.shipping),id=`pay-${randomUUID()}`,createdAt=new Date(now).toISOString(),freightGroups=fulfillment.groups.map(group=>({location:group.location,exVat:config.freightByLocation[group.location]??(fulfillment.groups.length===1?config.freightExVat:null)}));if(freightGroups.some(group=>group.exVat===null||group.exVat<=0))throw Error('Den faktiske fragtpris er ikke afklaret for alle forsendelser.');const freightExVat=freightGroups.reduce((sum,group)=>sum+group.exVat,0),freightIncVat=freightExVat+Math.round(freightExVat*.25),totalIncVat=quote.totalIncVat+freightIncVat;
 if(totalIncVat>999999999)throw Error('Ordren er for stor til onlinebetaling.');
 return {id,status:'prepared',paymentProvider:config.provider,createdAt,updatedAt:createdAt,lines,fulfillment,quote,shipping,freightGroups,freightExVat,freightIncVat,totalIncVat,stripeSessionId:null,stripePaymentIntentId:null,quickpayPaymentId:null,quickpayOrderId:null,pfOrderIds:[],events:[]};
}
export async function createStripeSession(order,{env=process.env,fetchImpl=fetch}={}){
 const config=checkoutConfiguration({...env,PAYMENT_PROVIDER:'stripe'});if(!config.ready)throw Error(config.reason);
 const base=new URL(env.SMERCH_PUBLIC_BASE_URL).origin,params=new URLSearchParams();
 params.set('mode','payment');params.set('locale','da');params.set('customer_email',order.shipping.email);
 params.set('payment_method_types[0]','card');params.set('payment_method_types[1]','mobilepay');
 params.set('payment_intent_data[capture_method]','manual');params.set('payment_intent_data[metadata][checkout_id]',order.id);
 params.set('client_reference_id',order.id);params.set('metadata[checkout_id]',order.id);
 params.set('success_url',`${base}/ordre?checkout=${encodeURIComponent(order.id)}`);
 params.set('cancel_url',`${base}/betaling?annulleret=1`);
 params.set('line_items[0][price_data][currency]','dkk');params.set('line_items[0][price_data][unit_amount]',String(order.quote.totalIncVat));params.set('line_items[0][price_data][product_data][name]','Produkter og tryk');params.set('line_items[0][quantity]','1');
 params.set('line_items[1][price_data][currency]','dkk');params.set('line_items[1][price_data][unit_amount]',String(order.freightIncVat));params.set('line_items[1][price_data][product_data][name]','Fragt i Danmark');params.set('line_items[1][quantity]','1');
 const response=await fetchImpl('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':`${order.id}:${order.paymentAttempt||0}`},body:params,signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok||!/^cs_(test|live)_/.test(result.id||'')||!/^https:\/\/checkout\.stripe\.com\//.test(result.url||''))throw Error('Betalingssiden kunne ikke oprettes hos Stripe.');
 return {id:result.id,url:result.url};
}
export async function persistCheckout(order){return save(order);}
export async function persistCheckoutArtwork(order,uploads){
 const expected=new Map(order.lines.flatMap(line=>line.decorations.flatMap(decoration=>(decoration.artworks||[]).map(art=>art.logo))).map(logo=>[logo.id,logo]));
 if(!Array.isArray(uploads)||uploads.length!==expected.size||uploads.length>40)throw Error('Alle logofiler skal følge med ordren.');
 let total=0;const assets=[];
 for(const upload of uploads){const logo=expected.get(upload?.id);if(!logo||assets.some(asset=>asset.id===upload.id)||typeof upload.base64!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(upload.base64))throw Error('En logofil mangler eller er ugyldig.');
  const bytes=Buffer.from(upload.base64,'base64');total+=bytes.length;if(bytes.length!==logo.size||total>20*1024*1024)throw Error('Logofilerne er for store eller ændret.');
  const head=bytes.subarray(0,256).toString('latin1'),extension=logo.name.split('.').pop().toLowerCase(),valid=extension==='pdf'&&logo.type==='application/pdf'?head.startsWith('%PDF-'):extension==='ai'&&logo.type==='application/illustrator'?head.startsWith('%PDF-')||head.startsWith('%!PS'):extension==='eps'&&logo.type==='application/postscript'?head.startsWith('%!PS'):extension==='cdr'&&logo.type==='application/vnd.corel-draw'?head.startsWith('RIFF')&&head.includes('CDR'):false;
  if(!valid)throw Error('En logofil har et forkert filformat.');assets.push({id:logo.id,name:logo.name,type:logo.type,size:bytes.length,bytes});
 }
 const folder=resolve(directory(),order.id);await mkdir(folder,{recursive:true,mode:0o700});order.artworks=[];
 for(const [index,asset] of assets.entries()){const path=resolve(folder,`${index}`);await writeFile(path,asset.bytes,{flag:'wx',mode:0o600});order.artworks.push({id:asset.id,name:asset.name,type:asset.type,size:asset.size,path});}
 return order;
}
export function verifyStripeEvent(raw,signature,secret,now=Date.now()){
 if(!secret||!Buffer.isBuffer(raw)||raw.length>1024*1024)throw Error('Ugyldigt Stripe-webhook.');
 const pairs=String(signature||'').split(',').map(x=>x.split('=')),timestamp=pairs.find(x=>x[0]==='t')?.[1],signatures=pairs.filter(x=>x[0]==='v1').map(x=>x[1]);
 if(!/^\d+$/.test(timestamp||'')||Math.abs(now-Number(timestamp)*1000)>300000||!signatures.length)throw Error('Ugyldig Stripe-signatur.');
 const expected=createHmac('sha256',secret).update(`${timestamp}.`).update(raw).digest();
 if(!signatures.some(hex=>{if(!/^[a-f0-9]{64}$/i.test(hex||''))return false;return timingSafeEqual(expected,Buffer.from(hex,'hex'));}))throw Error('Ugyldig Stripe-signatur.');
 return JSON.parse(raw.toString('utf8'));
}
export async function applyStripeEvent(event){
 const object=event?.data?.object,type=event?.type||'',isSession=type.startsWith('checkout.session.'),isIntent=type.startsWith('payment_intent.'),id=object?.metadata?.checkout_id||(isSession?object?.client_reference_id:null);
 if(!idPattern.test(id||'')||(!isSession&&!isIntent))return null;
 return locked(id,async()=>{const order=await readCheckout(id),at=new Date().toISOString();
  if(!order.stripeSessionId||event.livemode!==order.stripeSessionId.startsWith('cs_live_'))throw Error('Betalingsmiljøet passer ikke.');
  if(order.events.some(row=>row.id===event.id))return order;
  if(isSession){if(order.stripeSessionId!==object.id){if(order.previousSessionIds?.includes(object.id))return order;throw Error('Betalingssessionen passer ikke til ordren.');}if(object.currency&&object.currency!=='dkk'||object.amount_total!==undefined&&object.amount_total!==order.totalIncVat)throw Error('Betalingsbeløbet passer ikke til ordren.');if(object.payment_intent&&order.stripePaymentIntentId&&order.stripePaymentIntentId!==object.payment_intent)throw Error('Betalingen passer ikke til ordren.');if(object.payment_intent)order.stripePaymentIntentId=object.payment_intent;
   if(type==='checkout.session.expired'&&order.status==='awaiting_payment')order.status='expired';
  }else{if(order.previousPaymentIntentIds?.includes(object.id))return order;if(!/^pi_/.test(object.id||'')||object.currency!=='dkk'||object.amount!==order.totalIncVat)throw Error('Betalingen passer ikke til ordren.');if(order.stripePaymentIntentId&&order.stripePaymentIntentId!==object.id)throw Error('Betalingen passer ikke til ordren.');order.stripePaymentIntentId=object.id;
   if(type==='payment_intent.amount_capturable_updated'){if(object.status!=='requires_capture'||object.amount_capturable!==order.totalIncVat)throw Error('Beløbet er ikke reserveret fuldt ud.');if(['awaiting_payment','authorized'].includes(order.status)){order.status='authorized';order.authorizedAt=order.authorizedAt||at;order.authorizationExpiresAt=object.latest_charge?.payment_method_details?.card?.capture_before?new Date(object.latest_charge.payment_method_details.card.capture_before*1000).toISOString():order.authorizationExpiresAt||null;}}
   if(type==='payment_intent.succeeded'){if(object.amount_received!==order.totalIncVat)throw Error('Det hævede beløb passer ikke til ordren.');order.status='paid';order.paidAt=at;}
   if(type==='payment_intent.canceled'&&!['paid','cancelled'].includes(order.status))order.status='authorization_expired';
   if(type==='payment_intent.payment_failed'&&!['paid','cancelled'].includes(order.status))order.status='payment_failed';
  }
  order.updatedAt=at;order.events.push({id:event.id,type,at});await save(order);return order;
 });
}

async function stripeIntent(id,env,fetchImpl){const response=await fetchImpl(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(id)}?expand[]=latest_charge`,{headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`},signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Error('Betalingsreservationen kunne ikke kontrolleres hos Stripe.');return data;}
export async function refreshAuthorizationExpiry(id,{env=process.env,fetchImpl=fetch}={}){const order=await readCheckout(id);if(order.status!=='authorized'||!order.stripePaymentIntentId)return order;const intent=await stripeIntent(order.stripePaymentIntentId,env,fetchImpl),expiry=intent.latest_charge?.payment_method_details?.card?.capture_before;if(intent.status!=='requires_capture'||intent.amount_capturable!==order.totalIncVat)return order;if(!expiry)return order;return updateCheckout(id,current=>{if(current.status==='authorized'&&current.stripePaymentIntentId===intent.id)current.authorizationExpiresAt=new Date(expiry*1000).toISOString();return current;});}
export async function reauthorizeCheckout(id,{env=process.env,fetchImpl=fetch,validate=async()=>{}}={}){return locked(id,async()=>{const order=await readCheckout(id);if(!['authorization_expired','expired','payment_failed'].includes(order.status))throw Error('Ordren er ikke klar til en ny betalingsreservation.');if(order.paidAt)throw Error('Ordren er allerede betalt.');await validate(order);if(order.stripePaymentIntentId){const previous=await stripeIntent(order.stripePaymentIntentId,env,fetchImpl);if(previous.status==='succeeded')throw Error('Tidligere betaling er allerede hævet og skal afstemmes.');if(previous.status==='requires_capture'){const response=await fetchImpl(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(previous.id)}/cancel`,{method:'POST',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Idempotency-Key':`smerch-renew-cancel-${previous.id}`},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Den tidligere reservation kunne ikke frigives. Kontakt Smerch.');}}const nextAttempt=(order.paymentAttempt||0)+1;const session=await createStripeSession({...order,paymentAttempt:nextAttempt},{env,fetchImpl});order.paymentAttempt=nextAttempt;order.previousSessionIds=[...(order.previousSessionIds||[]),order.stripeSessionId].filter(Boolean);order.previousPaymentIntentIds=[...(order.previousPaymentIntentIds||[]),order.stripePaymentIntentId].filter(Boolean);order.stripeSessionId=session.id;order.stripePaymentIntentId=null;order.authorizedAt=null;order.authorizationExpiresAt=null;order.status='awaiting_payment';order.updatedAt=new Date().toISOString();order.events.push({at:order.updatedAt,type:'reauthorization_started'});await save(order);return {id:order.id,url:session.url};});}
export async function cancelCheckout(id,{env=process.env,fetchImpl=fetch}={}){return locked(id,async()=>{const order=await readCheckout(id);if(order.status==='cancelled')return order;if(order.status==='paid'||order.status==='capture_reconciliation')throw Error('Hævet eller uafklaret betaling kræver manuel refusion og afstemning.');if(order.stripePaymentIntentId){const intent=await stripeIntent(order.stripePaymentIntentId,env,fetchImpl);if(intent.status==='succeeded')throw Error('Betalingen er allerede hævet; annullér og refundér manuelt efter afstemning.');if(intent.status==='requires_capture'){const response=await fetchImpl(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(intent.id)}/cancel`,{method:'POST',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Idempotency-Key':`smerch-cancel-${intent.id}`},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Reservationen kunne ikke frigives hos Stripe.');}}order.status='cancelled';order.updatedAt=new Date().toISOString();order.events.push({at:order.updatedAt,type:'cancelled',pfCancellationRequired:Boolean(order.pfOrderIds?.length)});return save(order);});}
export async function captureCheckout(id,{env=process.env,fetchImpl=fetch,canCapture=async()=>true,now=Date.now()}={}){return locked(id,async()=>{const order=await readCheckout(id);if(order.status==='paid')return order;if(!['authorized','capture_reconciliation'].includes(order.status))throw Error('Ordren har ingen aktiv betalingsreservation.');if(!order.stripePaymentIntentId)throw Error('Stripe-betalingen mangler.');const intent=await stripeIntent(order.stripePaymentIntentId,env,fetchImpl);if(intent.status==='succeeded'&&intent.amount_received===order.totalIncVat){order.status='paid';order.paidAt=new Date(now).toISOString();order.updatedAt=order.paidAt;await save(order);return order;}if(!await canCapture(order))throw Error('Den seneste korrektur er ikke godkendt for alle PF-ordrer.');const expiry=intent.latest_charge?.payment_method_details?.card?.capture_before;if(intent.status!=='requires_capture'||intent.currency!=='dkk'||intent.amount!==order.totalIncVat||intent.amount_capturable!==order.totalIncVat||expiry&&expiry*1000<=now+60000){order.status='authorization_expired';order.updatedAt=new Date(now).toISOString();await save(order);throw Error('Betalingsreservationen er udløbet eller dækker ikke hele ordren. Kunden skal godkende betaling igen.');}if(expiry)order.authorizationExpiresAt=new Date(expiry*1000).toISOString();order.status='capture_reconciliation';order.updatedAt=new Date(now).toISOString();await save(order);let result;try{const response=await fetchImpl(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(intent.id)}/capture`,{method:'POST',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':`smerch-capture-${intent.id}`},body:new URLSearchParams({amount_to_capture:String(order.totalIncVat)}),signal:AbortSignal.timeout(15000)});result=await response.json();if(!response.ok)throw Error(String(result.error?.message||'Stripe afviste hævningen.').slice(0,200));}catch(error){order.events.push({at:new Date().toISOString(),type:'capture_needs_reconciliation',message:error.message});await save(order);throw error;}if(result.status!=='succeeded'||result.amount_received!==order.totalIncVat)throw Error('Hævningen kræver afstemning hos Stripe.');order.status='paid';order.paidAt=new Date().toISOString();order.updatedAt=order.paidAt;order.events.push({at:order.paidAt,type:'captured'});return save(order);});}
export async function updateCheckout(id,change){return locked(id,async()=>{const order=await readCheckout(id);const next=await change(order);next.updatedAt=new Date().toISOString();return save(next);});}
