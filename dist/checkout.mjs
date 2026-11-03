import {checkoutMarketingHTML,checkoutMarketingInput} from './checkout-marketing.mjs';
import {syncBillingFields} from './checkout-billing.mjs';
import {bindFreightQuote} from './checkout-freight.mjs';
import {renderShipmentTracking} from './shipment-tracking.mjs?v=3';
import {renderCartMockup,mailMockupBase64} from './cart-mockup.mjs?v=9';
import {addressPickerHTML,bindAddressPicker} from './address-picker.mjs?v=2';
import {hasPersonalisation,paymentDescription,freightEstimate} from './purchase-flow.mjs';
import {paymentMethodsHTML} from './payment-methods.mjs';
import {fromInc,quoteAmount,vatLabel,customerType,setCustomerType} from './customer-pricing.mjs';
import {launchConfig,launchMessage} from './launch-config.mjs';
import {LEGAL_VERSION} from './legal-consent.mjs?v=2026-11-03';
import {getLanguage} from './i18n-core.mjs';
import {readCart,writeCart,fetchQuote,kroner,escape} from './pf-cart.mjs?v=24';
import {loadFile} from './storage.mjs';
import {checkoutArtworkIssue} from './checkout-artwork-readiness.mjs';

const pilotRequested=()=>new URLSearchParams(location.search).get('test')==='pilot';
const liveTestRequested=()=>new URLSearchParams(location.search).get('test')==='live';
const adminTestEndpoint=()=>pilotRequested()?'/api/admin/checkout-pilot':liveTestRequested()?'/api/admin/checkout-live-test':'/api/admin/checkout-test';
const get=async url=>{const response=await fetch(url);if(!response.ok)throw Error('Oplysningerne kunne ikke hentes.');return response.json();};
const onlineOptions={creditcard:'Kortbetaling',mobilepay:'MobilePay','apple-pay':'Apple Pay','google-pay':'Google Pay'};
const onlineHelp='Beløbet reserveres ved bestilling og hæves, når hele ordren er afsendt. Du godkender betalingen hos Quickpay.';
const cardHelp='Kortfelterne åbner her på siden, når du har accepteret handelsbetingelserne og trykker Næste. Beløbet reserveres, når du betaler, og hæves først, når hele ordren er afsendt.';
const mobilePayHelp='Fortsæt til MobilePay for at indtaste dit nummer, hvis du bliver bedt om det, og godkend i appen. Beløbet hæves først ved afsendelse.';
const invoiceHelp='Du modtager en faktura. Vi bestiller først varerne, når hele betalingen er modtaget.';
function paymentOptions(methods=['card']){
 return `<option value="">Vælg en betalingsmetode</option>
 ${methods.map(method=>`<option value="${method}">${onlineOptions[method]||'Betal online med Quickpay'}</option>`).join('')}
 <option value="bank_transfer">Faktura med bankoverførsel</option>`;
}
function checkoutPaymentChoices(){
 return `<div class="checkout-payment-choice" data-checkout-payment hidden>
  <div data-checkout-method-step hidden>
   <label for="checkout-payment-method">Vælg betalingsmetode</label>
   <div class="checkout-method-controls">
    <select id="checkout-payment-method" name="paymentMethod" required>${paymentOptions()}</select>
    <button class="button wide" type="button" data-checkout-method-next disabled>Næste</button>
   </div>
  </div>
  <div data-checkout-review-step hidden>
   <h2 data-checkout-selected-method></h2>
   <p class="small checkout-payment-help" id="checkout-payment-help"></p>
   <label class="legal-check" id="bank-prepayment-consent" hidden>
    <input type="checkbox" name="bankPrepaymentAccepted" disabled>
    <span>Jeg vælger bankoverførsel og accepterer, at hele betalingen skal være modtaget før bestilling og produktion, både med og uden tryk.</span>
   </label>
  </div>
 </div>`;
}
function checkoutOrderItems(lines,catalog){
 if(!lines.length)return '';
 const total=lines.reduce((count,line)=>count+(Number(line.quantity)||0),0);
 return `<details class="checkout-order-items"><summary><span>Varer i ordren</span> <span>(${total})</span></summary>
 <ul>${lines.map(line=>{
  const product=catalog?.products?.find(product=>product.id===line.productId);
  const variant=product?.variants?.find(variant=>variant.sku===line.sku);
  const attributes=[variant?.color,variant?.size].filter(Boolean).map(escape).join(' · ');
  return `<li><div><strong>${escape(product?.name||line.sku||line.productId)}</strong>${attributes?`<small>${attributes}</small>`:''}</div><span>× ${escape(line.quantity)}</span></li>`;
 }).join('')}</ul></details>`;
}
export function checkoutPage(adminTest=false,ordersEnabled=launchConfig.ordersEnabled,catalog){if(!adminTest&&['1','live','pilot'].includes(new URLSearchParams(location.search).get('test')))return '<section class="wrap section" id="admin-checkout-test"><h1>Betalingstest</h1><p>Kontrollerer administratoradgang og testtilstand…</p></section>';const lines=readCart(),personalised=hasPersonalisation(lines);if(ordersEnabled!==true&&!adminTest)return `<section class="wrap section pf-checkout" id="checkout-launch-closed"><p class="eyebrow">VI ÅBNER SNART</p><h1>Dit design kan godt være klar før os.</h1><p class="intro">${launchMessage}</p><p>Din kurv er gemt i denne browser, så du kan arbejde videre med dit design.</p><a class="button" href="/kurv">Tilbage til kurven →</a></section>`;const approval=`<fieldset class="checkout-legal checkout-final" data-checkout-payment ${adminTest?'':'hidden aria-label="Betaling og godkendelse"'}>${adminTest?'<legend>3. Godkend og betal</legend>':''}<div class="checkout-terms">${adminTest?'':'<h2 class="checkout-approval">Godkend din ordre</h2>'}<p class="small checkout-business-terms" hidden>Ved erhvervskøb gælder korte reklamationsfrister, produktionstolerancer og begrænset ansvar som beskrevet i afsnit 13.</p><label class="legal-check"><input type="checkbox" name="termsAccepted" required><span>Jeg accepterer <a href="/handelsbetingelser" target="_blank" rel="noopener">handelsbetingelserne</a>.</span></label><label class="legal-check" ${!personalised?'hidden':''}><input type="checkbox" name="personalised" ${personalised?'required':'disabled'}><span>Jeg er informeret om, at varer med mit eget logo, navn, tekst eller individuelle design ikke har lovbestemt fortrydelsesret. Reklamationsretten berøres ikke.</span></label>${personalised&&!adminTest?'<p class="small checkout-cancellation">Du kan bede om annullering, indtil vi har sendt den godkendte korrektur til produktion. <a href="mailto:hello@smerch.dk">Send os en e-mail</a>.</p>':''}<p class="small">Se <a href="/privatlivspolitik" target="_blank" rel="noopener">privatlivspolitikken</a>.</p></div>${adminTest?'':checkoutMarketingHTML(getLanguage())}</fieldset>`;
 const submit=`<button class="button wide" type="submit" disabled data-checkout-payment ${adminTest?'':'hidden'}>${adminTest?(pilotRequested()?'Bestil rigtig testordre med betalingspligt':liveTestRequested()?'Reservér 5 kr. med MobilePay →':'Åbn testbetaling →'):'Betal'}</button><p class="small muted" data-checkout-payment ${adminTest?'':'hidden'}>${adminTest&&!pilotRequested()?'Testen sender ingen ordremail.':'Du modtager status på e-mail.'}</p>`;
 return `<section class="wrap section pf-checkout"> ${adminTest?`<nav class="purchase-path" aria-label="Købsforløb"><span class="complete"><i>1</i><b>Produkt</b></span><span class="complete"><i>2</i><b>Design</b></span><span class="complete"><i>3</i><b>Kurv</b></span><span class="active" aria-current="step"><i>4</i><b data-checkout-path>Betaling</b></span><span><i>5</i><b>${personalised?'Korrektur':'Levering'}</b></span></nav>`:`<nav class="purchase-path purchase-path--checkout" aria-label="Købsforløb"><span data-checkout-progress="details" aria-current="step"><i>1</i><b>Oplysninger og levering</b></span><span data-checkout-progress="payment"><i>2</i><b>Betalingsmetode</b></span><span data-checkout-progress="review"><i>3</i><b>Betaling</b></span></nav>`}<div class="checkout-heading">${adminTest?'<p class="eyebrow">INTERN TESTORDRE</p>':''}<h1 tabindex="-1">${adminTest?'Levering og betaling':'Oplysninger og levering'}</h1></div>${adminTest&&pilotRequested()?'<p class="checkout-test-notice" role="status"><strong>Rigtig ordre · kun for administrator.</strong> Kostprisen inklusive fragt og moms reserveres på dit kort. Ordren sendes til PF med logo, og kundemail sendes. Korrektur skal godkendes før produktion.</p>':adminTest&&liveTestRequested()?'<p class="checkout-test-notice" role="status">Live-test: Kun 5,00 kr. reserveres. Ingen varer bestilles. PF-afsendelse, hævning, fakturering og ordremail er blokeret. Kurvens normale priser bevares.</p>':adminTest?'<p class="checkout-test-notice" role="status"><strong>Kun testkort.</strong> Kortnummer: 1000 0000 0000 0008 · Udløb: 12/30 · Kontrolcifre: 208. Ingen PF-afsendelse eller ordremail. Din kurv beholdes efter testen.</p>':''}<div id="pf-checkout-artwork-notice" hidden><p class="error" role="alert"></p><a class="text-link" href="/kurv">Tilbage til kurven →</a></div><div class="checkout-intro" data-checkout-payment ${adminTest?'':'hidden'}><details><summary>Sådan fungerer betalingen</summary><p>Du handler som gæst uden at oprette en konto. ${paymentDescription(readCart())} Hvis reservationen udløber inden da, beder vi dig godkende betalingen igen.</p></details></div><form class="cart-layout" id="pf-checkout-form" data-admin-test="${adminTest}" data-checkout-step="${adminTest?'payment':'details'}">${adminTest?'':'<button type="button" class="checkout-back-details" data-checkout-back data-checkout-payment aria-label="Tilbage til oplysninger og levering" hidden>Tilbage</button>'}<div class="checkout-main"><div class="checkout-details-panel" data-checkout-details><fieldset class="checkout-legal checkout-customer-type"><legend>Kundeoplysninger</legend><label>Køber som<select name="customerType" required><option value="">Vælg kundetype</option><option value="consumer">Privatperson</option><option value="business">Erhverv</option></select></label><div id="checkout-business" hidden><div class="form-grid"><label>Firmanavn *<input name="billingCompany" autocomplete="organization" maxlength="200" disabled></label><label>CVR-nummer *<input name="billingCvr" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" disabled></label><label>Faktura-e-mail *<input name="billingEmail" type="email" maxlength="254" disabled></label><label>Reference (valgfrit)<input name="billingReference" maxlength="200" disabled></label><label class="legal-check" style="grid-column:1/-1"><input type="checkbox" name="differentBillingAddress" disabled><span>Anden fakturaadresse end leveringsadressen</span></label><p class="small" style="grid-column:1/-1">Fakturaadressen følger leveringsadressen, medmindre du vælger en anden adresse.</p><label>Fakturaadresse *<input name="billingStreet" maxlength="200" disabled></label><label>Postnummer *<input name="billingPostalCode" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" disabled></label><label>By *<input name="billingCity" maxlength="200" disabled></label><label>Fakturaland<select name="billingCountry" disabled><option value="DK">Danmark</option></select></label><label>EAN (valgfrit)<input name="billingEan" inputmode="numeric" pattern="[0-9]{13}" maxlength="13" disabled></label></div></div></fieldset><fieldset class="checkout-delivery"><legend>Leveringsadresse</legend><div class="form-grid"><label>Navn *<input name="name" autocomplete="name" required maxlength="200"></label><label>E-mail *<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label>Telefon *<input name="phone" type="tel" autocomplete="tel" required maxlength="40"></label><label>Virksomhed<input name="company" autocomplete="organization" maxlength="200"></label>${addressPickerHTML()}<details class="checkout-delivery-extra"><summary>Tilføj leveringskommentar (valgfrit)</summary><label>Kommentar til levering<input name="deliveryComment" maxlength="100" placeholder="Fx port 2 eller indgang fra gården"><span class="small muted">Maks. 100 tegn. Sendes med leveringsadressen til leverandøren. Særlige leveringsønsker kan ikke garanteres.</span></label></details></div></fieldset></div>${adminTest?approval:checkoutPaymentChoices()}
 ${adminTest?'':`<div class="checkout-confirmation" hidden>${approval}${submit}</div>`}
 ${adminTest?'':`<section class="checkout-card-window" data-checkout-card-window hidden aria-labelledby="checkout-card-title">
  <h2 id="checkout-card-title" tabindex="-1">Indtast kortoplysninger</h2>
  <p class="small"><a data-checkout-card-link>Åbn kortbetalingen i hele vinduet</a></p>
 </section>`}
 <p class="error" id="pf-checkout-error" role="alert"></p>${adminTest?'':'<button class="button wide" type="button" data-checkout-next disabled>Til betalingsmetode →</button>'}${adminTest?submit:''}</div><aside class="checkout-sidebar"><div class="cart-summary"><h2>Ordreoverblik</h2>${checkoutOrderItems(lines,catalog)}<div id="pf-checkout-summary" aria-live="polite">Beregner pris…</div><a class="checkout-back-cart" href="/kurv">Ret din kurv</a>${adminTest?paymentMethodsHTML:''}</div></aside></form></section>`;}
export function orderPage(){const id=new URLSearchParams(location.search).get('checkout')||'';return `<section class="wrap section pf-checkout"><nav class="purchase-path" aria-label="Købsforløb"><span class="complete"><i>1</i><b>Produkt</b></span><span class="complete"><i>2</i><b>Design</b></span><span class="complete"><i>3</i><b>Kurv</b></span><span class="complete"><i>4</i><b>Betaling</b></span><span class="active" aria-current="step"><i>5</i><b>Status</b></span></nav><p class="eyebrow">DIN ORDRE</p><h1>Ordrestatus</h1><div class="review-complete"><p id="pf-order-status" aria-live="polite">Kontrollerer betalingen…</p><div id="pf-order-tracking"></div><button type="button" id="pf-reauthorize" class="button" style="display:none" hidden>Godkend betalingen igen</button>${id?`<p class="small muted">Ordreference: ${escape(id)}</p>`:''}<a class="text-link" href="/produkter">Tilbage til produkterne</a></div></section>`;}
function showCardWindow(form,{id,url},onCancel){
 const panel=form.querySelector('[data-checkout-card-window]'),frame=document.createElement('iframe');
 const fallback=panel.querySelector('[data-checkout-card-link]');
 fallback.href=url;
 frame.title=getLanguage()==='en'?'Secure card payment':'Sikker kortbetaling';
 frame.setAttribute('sandbox','allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
 frame.addEventListener('load',()=>{
  let returned;
  try{returned=new URL(frame.contentWindow.location.href);}catch{return;}
  if(returned.origin!==location.origin)return;
  if(returned.pathname==='/ordre'&&returned.searchParams.get('checkout')===id){location.assign(returned.href);return;}
  if(returned.pathname==='/betaling'&&returned.searchParams.get('annulleret')==='1'){
   if(onCancel){void onCancel();return;}
   frame.remove();
   panel.querySelector('h2').textContent='Kortbetalingen er afbrudt';
   fallback.focus();
  }
 });
 frame.src=url;
 panel.append(frame);
 panel.hidden=false;
 if(form.elements.paymentMethod)form.elements.paymentMethod.disabled=true;
 const confirmation=form.querySelector('.checkout-confirmation');
 if(confirmation){confirmation.inert=true;confirmation.hidden=true;}
 else form.querySelector('button[type=submit]').hidden=true;
 form.querySelector('#checkout-payment-help').hidden=true;
 panel.querySelector('h2').focus();
}
export async function bindCheckout(notify,catalog){
 const closed=document.querySelector('#checkout-launch-closed');if(closed){
  try{
   const status=await get('/api/checkout/status');
   if(closed.isConnected&&status.ready===true&&status.launch?.ordersEnabled===true){closed.outerHTML=checkoutPage(false,true,catalog);return bindCheckout(notify,catalog);}
  }catch{} // A failed/closed status leaves the saved cart and closed page intact.
  return;
 }

 const gate=document.querySelector('#admin-checkout-test');if(gate){try{const response=await fetch(adminTestEndpoint()+'/status'),config=await response.json();if(!response.ok||!config.ready)throw Error(config.error||config.reason||'Testadgang er ikke klar.');if(!gate.isConnected)return;gate.outerHTML=checkoutPage(true,true,catalog);return bindCheckout(notify,catalog);}catch(error){if(gate.isConnected){gate.replaceChildren();const message=document.createElement('p');message.textContent=error.message;const login=document.createElement('a');login.href='/admin';login.textContent='Åbn medarbejderlogin →';gate.append(message,login);}return;}}
 const form=document.querySelector('#pf-checkout-form');if(form){const adminTest=form.dataset.adminTest==='true';const button=form.querySelector('button[type=submit]'),summary=document.querySelector('#pf-checkout-summary'),error=document.querySelector('#pf-checkout-error'),lines=readCart();
  form.onsubmit=event=>event.preventDefault();
  bindAddressPicker(form);
  let submitting=false,cardWindow=null,closingCardWindow=false;
  const paymentMethod=form.elements.paymentMethod;
  const cardSelected=()=>paymentMethod?.value==='creditcard';
  const confirmation=form.querySelector('.checkout-confirmation');
  const syncPayment=()=>{
   const method=paymentMethod.value,bank=method==='bank_transfer';
   const helpByMethod={bank_transfer:invoiceHelp,creditcard:cardHelp,mobilepay:mobilePayHelp};
   form.querySelector('[data-checkout-selected-method]').textContent=paymentMethod.selectedOptions[0]?.textContent||'';
   form.querySelector('#checkout-payment-help').textContent=helpByMethod[method]||onlineHelp;
   if(!submitting)button.textContent=bank?'Bestil med betalingspligt →':cardSelected()?'Næste':'Betal';
   const consent=form.elements.bankPrepaymentAccepted;
   form.querySelector('#bank-prepayment-consent').hidden=!bank;
   consent.disabled=!bank;
   consent.required=bank;
   if(!bank)consent.checked=false;
   updateButtons();
  };
  form.elements.customerType.value=customerType();
  let refreshSummary=()=>{},freightController=null,checkoutStep=adminTest?'review':'details',checkoutReady=false;
  const next=form.querySelector('[data-checkout-next]'),back=form.querySelector('[data-checkout-back]');
  const methodNext=form.querySelector('[data-checkout-method-next]');
  const checkoutSection=form.closest('.pf-checkout');
  const heading=checkoutSection.querySelector('.checkout-heading h1'),progress=[...checkoutSection.querySelectorAll('[data-checkout-progress]')];
  const detailsFields=[...form.querySelectorAll('[data-checkout-details] :is(input,select,textarea)')];
  const detailsValid=()=>detailsFields.every(control=>control.reportValidity());
  const updateButtons=()=>{
   button.disabled=!checkoutReady||submitting||checkoutStep!=='review';
   if(paymentMethod)paymentMethod.inert=submitting;
   if(confirmation){
    confirmation.hidden=checkoutStep!=='review'||Boolean(cardWindow);
    confirmation.inert=submitting;
   }
   if(next)next.disabled=!checkoutReady;
   if(methodNext){
    methodNext.disabled=!checkoutReady;
   }
   if(back)back.disabled=closingCardWindow||(submitting&&!cardWindow);
  };
  const steps={
   details:'Oplysninger og levering',
   payment:'Betalingsmetode',
   review:'Betaling'
  };
  const showStep=step=>{
   checkoutStep=step;
   form.dataset.checkoutStep=step;
   for(const element of form.querySelectorAll('[data-checkout-details],.checkout-freight'))element.hidden=step!=='details';
   for(const element of checkoutSection.querySelectorAll('[data-checkout-payment]'))element.hidden=step==='details';
   for(const element of form.querySelectorAll('[data-checkout-method-step]'))element.hidden=step!=='payment';
   for(const element of form.querySelectorAll('[data-checkout-review-step]'))element.hidden=step!=='review';
   next.hidden=step!=='details';
   back.ariaLabel=step==='review'?'Tilbage til betalingsvalg':'Tilbage til oplysninger og levering';
   heading.textContent=steps[step];
   const currentIndex=progress.findIndex(item=>item.dataset.checkoutProgress===step);
   for(const [index,item] of progress.entries()){
    if(index===currentIndex)item.setAttribute('aria-current','step');
    else item.removeAttribute('aria-current');
    item.classList.toggle('complete',index<currentIndex);
   }
   updateButtons();
   heading.focus();
  };
  const continueToPayment=()=>{if(checkoutReady&&detailsValid()){error.textContent='';showStep('payment');}};
  const continueToReview=()=>{if(checkoutReady&&paymentMethod.reportValidity()){error.textContent='';showStep('review');}};
  if(next){
   form.noValidate=true;
   next.onclick=continueToPayment;
   methodNext.onclick=continueToReview;
   back.onclick=()=>{if(cardWindow){void closeCardWindow();return;}error.textContent='';showStep(checkoutStep==='review'?'payment':'details');};
  }
  const closeCardWindow=async()=>{
   if(!cardWindow||closingCardWindow)return;
   const {id,url}=cardWindow;
   closingCardWindow=true;
   updateButtons();
   error.textContent='';
   try{
    const response=await fetch(`/api/checkout/${encodeURIComponent(id)}/abandon-card`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({link:url})});
    const result=await response.json();
    if(!response.ok||result.closed!==true)throw Error(result.error||'Kortbetalingen kunne ikke lukkes.');
   }catch(e){error.textContent=e.message;closingCardWindow=false;updateButtons();return;}
   const panel=form.querySelector('[data-checkout-card-window]');
   panel.querySelector('iframe')?.remove();
   panel.querySelector('[data-checkout-card-link]').removeAttribute('href');
   panel.hidden=true;
   form.querySelector('#checkout-payment-help').hidden=false;
   if(sessionStorage.getItem('pf-checkout-id')===id){
    sessionStorage.removeItem('pf-checkout-id');
    sessionStorage.removeItem('pf-checkout-cart');
   }
   cardWindow=null;
   closingCardWindow=false;
   submitting=false;
   paymentMethod.disabled=false;
   showStep('payment');
   syncPayment();
   paymentMethod.focus();
  };
  if(paymentMethod){
   paymentMethod.addEventListener('change',syncPayment);
   syncPayment();
  }
  const business=document.querySelector('#checkout-business');
  const businessTerms=form.querySelector('.checkout-business-terms');
  const syncCustomer=()=>{
   syncBillingFields(form,business);
   businessTerms.hidden=form.elements.customerType.value!=='business';
  };
  form.elements.differentBillingAddress.addEventListener('change',syncCustomer);
  form.elements.customerType.addEventListener('change',()=>{setCustomerType(form.elements.customerType.value);syncCustomer();});syncCustomer();
  const onPricingChange=()=>{if(!form.isConnected){window.removeEventListener('customer-pricing-change',onPricingChange);return;}form.elements.customerType.value=customerType();syncCustomer();refreshSummary();};window.addEventListener('customer-pricing-change',onPricingChange);
  if(!lines.length){summary.textContent='Kurven er tom.';return;}
  const artworkIssue=await checkoutArtworkIssue(lines);if(!form.isConnected)return;if(artworkIssue){const notice=document.querySelector('#pf-checkout-artwork-notice');notice.hidden=false;notice.querySelector('p').textContent=artworkIssue;summary.textContent='Onlinebestilling er sat på pause.';return;}
  try{const [quote,config,fulfillment]=await Promise.all([adminTest&&pilotRequested()?fetch('/api/admin/checkout-pilot/quote',{method:'POST',headers:{'Content-Type':'application/json','X-Smerch-Admin':'1'},body:JSON.stringify({lines})}).then(async response=>{const result=await response.json();if(!response.ok)throw Error(result.error||'Kostprisen kunne ikke hentes.');return result;}):fetchQuote(lines),get(adminTest?adminTestEndpoint()+'/status':'/api/checkout/status'),fetch('/api/checkout/fulfillment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lines})}).then(response=>{if(!response.ok)throw Error('Forsendelserne kunne ikke vurderes.');return response.json();})]);if(!document.contains(form))return;
   if(paymentMethod&&config.provider==='quickpay'){
    const methods=(config.onlineMethods||[]).filter(method=>Object.hasOwn(onlineOptions,method));
    if(methods.length){
     const selected=paymentMethod.value;
     paymentMethod.innerHTML=paymentOptions(methods);
     paymentMethod.value=selected==='bank_transfer'||methods.includes(selected)?selected:'';
     syncPayment();
    }
   }
   if(quote.totalIncVat===null){summary.innerHTML=`<p class="error">${escape(quote.message||'Prisen mangler.')}</p>`;return;}
   let freight=adminTest&&pilotRequested()&&Number.isSafeInteger(quote.internalFreightExVat)?{exVat:quote.internalFreightExVat,incVat:quote.internalFreightExVat+Math.round(quote.internalFreightExVat*.25)}:freightEstimate(fulfillment,config,customerType()),freightExVat=freight?.exVat??null,freightIncVat=freight?.incVat??null;refreshSummary=()=>{if(config.fixedCustomerFreight&&!(adminTest&&pilotRequested())){freight=freightEstimate(fulfillment,config,customerType());freightExVat=freight?.exVat??null;freightIncVat=freight?.incVat??null;}summary.innerHTML=`<dl class="pf-price-breakdown"><div><dt>Varer og tryk ${vatLabel()}</dt><dd>${kroner(quoteAmount(quote))}</dd></div><div><dt>Fragt ${vatLabel()}</dt><dd>${freightIncVat!==null?kroner(fromInc(freightIncVat,freightExVat)):'Afventer'}</dd></div>${customerType()==='business'?`<div><dt>Subtotal ekskl. moms</dt><dd>${freightExVat!==null?kroner(quote.net+freightExVat):'Afventer'}</dd></div><div><dt>Moms (25 %)</dt><dd>${freightIncVat!==null?kroner(quote.vat+freightIncVat-freightExVat):'Afventer'}</dd></div>`:''}<div class="pf-price-total"><dt>${adminTest&&liveTestRequested()?'Kurvens normale pris inkl. moms':'I alt inkl. moms'}</dt><dd>${freightIncVat!==null?kroner(quote.totalIncVat+freightIncVat):'Afventer'}</dd></div></dl>`;
   const delivery=config.deliveryTerms?.[getLanguage()];if(delivery){const info=document.createElement('details');info.className='checkout-delivery-info';const title=document.createElement('summary');title.textContent='Leveringstid';const text=document.createElement('p');text.textContent=delivery;info.append(title,text);summary.append(info);}
   if(adminTest&&liveTestRequested()){const info=document.createElement('p');info.textContent='Til reservation i denne live-test: 5,00 kr. Ingen varer bestilles.';summary.append(info);}
   };refreshSummary();
   if(!fulfillment.ready){error.textContent=fulfillment.message;return;}
   if(!config.ready){error.textContent=`Betaling er endnu ikke åben: ${config.reason}`;return;}const delivery=config.deliveryTerms?.[getLanguage()];if(!delivery){error.textContent='Leveringstiden skal afklares før onlinebestilling.';return;}if(!adminTest&&config.freightQuoteRequired){freightController=bindFreightQuote(form,{readCart,goodsTotalIncVat:quote.totalIncVat,onChange:({price,accepted})=>{freightExVat=price?.freightExVat??null;freightIncVat=price?.freightIncVat??null;refreshSummary();checkoutReady=accepted;
    if(!accepted&&checkoutStep!=='details'&&!submitting)showStep('details');
    updateButtons();}});}else{checkoutReady=true;updateButtons();}
  }catch(e){error.textContent=e.message;return;}
  form.onsubmit=async event=>{event.preventDefault();
   if(!checkoutReady||submitting)return;
   if(checkoutStep==='details'){continueToPayment();return;}
   if(checkoutStep==='payment'){continueToReview();return;}
   if(!adminTest&&detailsFields.some(control=>!control.checkValidity())){
    showStep('details');detailsValid();return;
   }
   if(paymentMethod&&!paymentMethod.checkValidity()){showStep('payment');paymentMethod.reportValidity();return;}
   if(!form.reportValidity())return;
   const method=paymentMethod?.value||'card';
   submitting=true;updateButtons();error.textContent='';button.textContent='Forbereder betaling…';
   try{if(freightController&&!freightController.acceptedQuote())throw Error('Fragt og samlet pris skal godkendes, før du bestiller.');const lines=readCart(),artworkIssue=await checkoutArtworkIssue(lines);if(artworkIssue)throw Error(artworkIssue);const ids=[...new Set(lines.filter(line=>!line.companyTemplate).flatMap(line=>line.decorations.flatMap(deco=>(deco.artworks||[]).map(art=>art.logo.id))))],artworks=[];
    for(const id of ids){const blob=await loadFile(id);if(!blob)throw Error('En logofil mangler i browseren. Åbn produktet og upload den igen.');const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));artworks.push({id,base64:btoa(binary)});}
    const mockups=[];
    for(const [lineIndex,line] of lines.entries()){
     try{
      const product=await get('/api/pf-product/'+encodeURIComponent(line.productId)),variant=product.variants.find(v=>v.sku===line.sku);
      for(const [decorationIndex,design] of line.decorations.entries()){
       try{
        let base64;
        if(line.companyTemplate){const r=await fetch(`/api/company/previews/${encodeURIComponent(line.companyTemplate.id)}/${decorationIndex}`);if(!r.ok)throw Error('Det gemte mockup kunne ikke hentes.');const bytes=new Uint8Array(await r.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));base64=btoa(binary);}
        else{const canvas=await renderCartMockup(product,variant.options.find(o=>o.id===design.optionId),design,{variant});base64=mailMockupBase64(canvas);}
        if(base64.length>2*1024*1024||mockups.reduce((n,m)=>n+m.base64.length,0)+base64.length>8*1024*1024)throw Error('Mockuppet er for stort til ordrebekræftelsen.');
        mockups.push({lineIndex,decorationIndex,base64});
       }catch(error){throw Error('Mockup kunne ikke gemmes: '+error.message+' Prøv igen, før du går til betaling.');}
      }
     }catch(error){throw error;}
    }
    const shipping=Object.fromEntries(new FormData(form)),response=await fetch(adminTest?adminTestEndpoint()+'/session':'/api/checkout/session',{method:'POST',headers:{'Content-Type':'application/json',...(adminTest?{'X-Smerch-Admin':'1'}:{})},body:JSON.stringify({lines,paymentMethod:method==='bank_transfer'?'bank_transfer':'card',...(Object.hasOwn(onlineOptions,method)?{quickpayMethod:method}:{}),...(method==='creditcard'?{inlineCardPayment:true}:{}),bankPrepaymentAccepted:form.elements.bankPrepaymentAccepted?.checked===true,shipping,artworks,mockups,marketing:checkoutMarketingInput(form.elements.marketingEmail?.checked,getLanguage()),deliveryMethod:'STD',freightQuote:freightController?.acceptedQuote()||null,billing:{useDeliveryAddress:!form.elements.differentBillingAddress.checked,company:form.elements.billingCompany.value,cvr:form.elements.billingCvr.value,email:form.elements.billingEmail.value,reference:form.elements.billingReference.value,street:form.elements.billingStreet.value,postalCode:form.elements.billingPostalCode.value,city:form.elements.billingCity.value,country:form.elements.billingCountry.value,ean:form.elements.billingEan.value},legal:{version:LEGAL_VERSION,locale:getLanguage(),customerType:form.elements.customerType.value,accepted:form.elements.termsAccepted.checked,personalised:form.elements.personalised.checked}})}),result=await response.json();if(!response.ok)throw Error(result.error||'Betalingen kunne ikke startes.');sessionStorage.setItem('pf-checkout-id',result.id);sessionStorage.setItem('pf-checkout-cart',JSON.stringify(lines));
    if(method==='creditcard'&&result.framed===true&&/^https:\/\/payment\.quickpay\.net\/payments\/[A-Za-z0-9_-]+$/.test(result.url)){
     if(!adminTest)cardWindow=result;
     showCardWindow(form,result,adminTest?undefined:closeCardWindow);
     updateButtons();
    }else location.assign(result.url);
   }catch(e){error.textContent=e.message;submitting=false;if(freightController&&!freightController.acceptedQuote()){checkoutReady=false;showStep('details');}updateButtons();button.textContent=adminTest?(pilotRequested()?'Bestil rigtig testordre med betalingspligt':liveTestRequested()?'Reservér 5 kr. med MobilePay →':'Åbn testbetaling →'):'Betal';if(paymentMethod)syncPayment();notify?.(e.message);}
  };
 }
 const status=document.querySelector('#pf-order-status');if(status){const id=new URLSearchParams(location.search).get('checkout');if(!/^pay-[a-f0-9-]{36}$/.test(id||'')){status.textContent='Betalingsreferencen mangler.';return;}
  let pilotOrder=false;const retry=document.querySelector('#pf-reauthorize'),tracking=document.querySelector('#pf-order-tracking');retry.onclick=async()=>{retry.disabled=true;try{const response=await fetch(`/api/${pilotOrder?'admin/checkout-pilot':'checkout'}/${encodeURIComponent(id)}/reauthorize`,{method:'POST',headers:pilotOrder?{'X-Smerch-Admin':'1'}:{}}),result=await response.json();if(!response.ok)throw Error(result.error||'Betalingen kunne ikke startes igen.');location.assign(result.url);}catch(error){status.textContent=error.message;retry.disabled=false;}};
  const refresh=async()=>{try{const order=await get(`/api/checkout/${encodeURIComponent(id)}`);if(!document.contains(status))return;pilotOrder=order.adminPilot===true;const finalStep=document.querySelector('.purchase-path [aria-current=step] b');if(finalStep)finalStep.textContent=order.personalised?'Korrektur':'Levering';retry.hidden=order.adminTest||!['authorization_expired','expired','payment_failed'].includes(order.status);retry.style.display=retry.hidden?'none':'';if(!order.adminTest&&['authorized','capture_reconciliation','paid','awaiting_bank_payment'].includes(order.status)&&sessionStorage.getItem('pf-checkout-id')===id&&sessionStorage.getItem('pf-checkout-cart')===JSON.stringify(readCart()))writeCart([],{track:false});if(order.paymentProvider==='bank_transfer'&&['awaiting_bank_payment','paid'].includes(order.status)){status.textContent=order.status==='paid'?`Din bankbetaling på ${kroner(order.totalIncVat)} er modtaget. Vi behandler nu ordren. Ved tryk skal korrekturen godkendes før produktion.`:`Din ordre er modtaget. ${order.bankPayment?.invoiceNumber?'Faktura '+order.bankPayment.invoiceNumber+' er registreret. Følg betalingsoplysningerne på fakturaen.':'Du modtager fakturaen separat. Afvent fakturaen før betaling.'} I alt: ${kroner(order.totalIncVat)}. Modtaget: ${kroner(order.bankPayment?.received||0)}. Ingen varer bestilles eller produceres, før hele beløbet er modtaget – både med og uden tryk.`;}else if(order.status==='authorized')status.innerHTML=`<strong>${kroner(order.totalIncVat)} er reserveret, men ikke hævet.</strong><br>${order.personalised?(order.proofPrepayment?'Beløbet hæves efter din korrekturgodkendelse og Smerchs interne godkendelse, før produktionen frigives.':'Vi afventer den endelige korrektur og produktionsgodkendelse. Beløbet hæves automatisk, når hele ordren er afsendt.'):'Vi behandler din ordre. Beløbet hæves automatisk, når hele ordren er afsendt.'}${order.authorizationExpiresAt&&order.captureDeadlinePolicy!=='clearhaus-179-days'?` Reservationen udløber ${new Date(order.authorizationExpiresAt).toLocaleString('da-DK')}.`:''}`;else if(order.status==='capture_reconciliation')status.textContent='Godkendelsen er registreret. Vi afstemmer hævningen hos betalingsudbyderen.';else if(order.status==='paid'){const pf=order.pfOrders||[],released=pf.length>0&&pf.every(row=>['approval_recorded','processing','shipped'].includes(row.status));status.innerHTML=`<strong>Betalingen på ${kroner(order.totalIncVat)} er hævet.</strong><br>${order.captureTiming==='dispatch'?'Hele ordren er afsendt. Se leveringsstatus nedenfor.':order.personalised?(released?'Produktionspartneren har kvitteret for korrekturgodkendelsen.':'Produktionen afventer kvittering på korrekturgodkendelsen.'):'Dine varer er afsendt. Se leveringsstatus nedenfor.'}`;}else if(order.status==='cancelled')status.textContent='Ordren er annulleret. Kontakt Smerch, hvis du har spørgsmål om betalingen.';else if(order.status==='cancellation_reconciliation')status.textContent='Vi kontrollerer annulleringen hos betalingsudbyderen.';else if(order.status==='payment_renewal')status.textContent='Vi forbereder et nyt betalingslink. Vent på bekræftelsen, før du prøver igen.';else if(['needs_attention','payment_setup_uncertain'].includes(order.status))status.textContent='Betalingen kræver manuel afklaring. Kontakt Smerch, før du prøver igen.';else if(order.status==='authorization_expired')status.textContent='Reservationen er udløbet. Godkend betalingen igen, så ordren kan fortsætte.';else if(order.status==='expired')status.textContent='Betalingslinket er udløbet. Godkend betalingen igen.';else if(order.status==='payment_failed')status.textContent='Betalingen lykkedes ikke. Prøv at godkende den igen.';else status.textContent='Vi afventer bekræftelse på reservationen. Siden opdateres automatisk.';if(order.awaitingSmerchReview&&order.status==='authorized')status.textContent='Din ordre er modtaget og afventer Smerchs gennemgang, før vi sender den til leverandøren. Beløbet er reserveret, ikke hævet.';if(order.awaitingEmbroideryReview&&['authorized','paid'].includes(order.status)){status.append(document.createElement('br'),document.createTextNode('Vi kontrollerer broderiets trådfarver, før vi sender ordren til leverandøren.'));}if(order.adminLiveTest)status.textContent=order.status==='authorized'?'5,00 kr. er reserveret via MobilePay. Smerch har verificeret QuickPays betalingsbesked. Ingen PF-afsendelse, hævning, fakturering eller ordremail. Annullér testen i administrationen.':order.status==='cancelled'?'Live-testen er annulleret. Ingen penge er hævet.':`Live-test 5 kr.: ${order.status}. Afventer QuickPay.`;else if(order.adminTest)status.textContent=order.status==='authorized'?'Testbetaling godkendt. Smerch har modtaget og verificeret QuickPays betalingsbesked. Ingen PF-ordre eller ordremail er sendt.':`Betalingstest: ${order.status}. Afventer godkendt testbetaling og betalingsbesked.`;renderShipmentTracking(tracking,order.pfOrders);if(['authorized','capture_reconciliation','paid','awaiting_payment','awaiting_bank_payment','payment_renewal','cancellation_reconciliation'].includes(order.status))setTimeout(refresh,5000);}catch{status.textContent='Ordrestatus kunne ikke hentes. Genindlæs siden om lidt.';}};refresh();
 }
}
