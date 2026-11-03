import {MARKETING_VERSION,marketingConsent} from './legal-consent.mjs';
export function checkoutMarketingHTML(locale='da'){
 const en=locale==='en';
 const consent=marketingConsent[en?'en':'da'].email;
 const ownAddress=en?'I am subscribing my own email address.':'Jeg tilmelder min egen e-mailadresse.';
 const optional=en?'Optional. You can buy without subscribing and unsubscribe for free at any time.':'Valgfrit. Du kan købe uden tilmelding og afmelde dig gratis når som helst.';
 return `<div class="checkout-marketing">
  <label class="legal-check">
   <input type="checkbox" name="marketingEmail" aria-describedby="checkout-marketing-optional">
   <span>${consent} ${ownAddress}</span>
  </label>
  <p class="small muted" id="checkout-marketing-optional">${optional} <a href="/marketing?mode=unsubscribe" target="_blank" rel="noopener">${en?'Unsubscribe':'Afmeld'}</a>.</p>
 </div>`;
}
export function checkoutMarketingInput(checked,locale='da'){
 return {email:checked===true,version:MARKETING_VERSION,locale:locale==='en'?'en':'da'};
}
