import {MARKETING_VERSION} from '../dist/legal-consent.mjs';
import {subscribeMarketing,validateMarketing} from './legal-services.mjs';
// Called only by the final checkout POST, never by field changes or page views.
export async function recordCheckoutMarketing(order,input,{base,now=Date.now()}={}){
 if(order.adminTest||order.adminLiveTest||order.adminPilot||input?.email!==true)return null;
 if(input.version!==MARKETING_VERSION)throw Error('Samtykket til tilbud er ændret. Genindlæs siden, eller fjern tilmeldingen.');
 const choice={version:MARKETING_VERSION,ownDetails:true,email:true,sms:false,emailAddress:order.shipping?.email,locale:order.legal?.locale==='en'?'en':'da'};
 const [validated]=validateMarketing(choice);
 await subscribeMarketing(choice,{...(base?{base}:{}),now,source:'/checkout',orderReference:order.id});
 const consent={version:MARKETING_VERSION,acceptedAt:new Date(now).toISOString(),channel:'email',address:validated.address,text:validated.text,locale:validated.locale,source:'/checkout'};
 order.marketingConsent=consent;return consent;
}
