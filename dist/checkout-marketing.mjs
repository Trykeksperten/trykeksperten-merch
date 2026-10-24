import {MARKETING_VERSION,marketingConsent} from './legal-consent.mjs';
export function checkoutMarketingHTML(locale='da'){
 const en=locale==='en';
 return `<div class="checkout-marketing"><label class="legal-check"><input type="checkbox" name="marketingEmail"><span>${marketingConsent[en?'en':'da'].email} ${en?'I am subscribing my own email address.':'Jeg tilmelder min egen e-mailadresse.'}</span></label><p class="small muted">${en?'Optional. You can buy without subscribing and unsubscribe at any time, free of charge.':'Valgfrit. Du kan købe uden at tilmelde dig og afmelde dig gratis når som helst.'} <a href="/marketing?mode=unsubscribe" target="_blank" rel="noopener">${en?'Unsubscribe':'Afmeld tilbud'}</a>.</p></div>`;
}
export function checkoutMarketingInput(checked,locale='da'){
 return {email:checked===true,version:MARKETING_VERSION,locale:locale==='en'?'en':'da'};
}
