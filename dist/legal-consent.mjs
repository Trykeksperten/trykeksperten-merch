export const LEGAL_VERSION='2026-11-03';
export const MARKETING_VERSION='2026-10-01';
export const marketingConsent={
 da:{email:'Ja tak, Smerch (Trykeksperten ApS) må sende mig tilbud, produktnyheder og inspiration om merchandise, profilbeklædning, tryk og specialproduktion via e-mail.',sms:'Ja tak, Smerch (Trykeksperten ApS) må sende mig tilbud, produktnyheder og inspiration om merchandise, profilbeklædning, tryk og specialproduktion via SMS.'},
 en:{email:'Yes, Smerch (Trykeksperten ApS) may email me offers, product news and inspiration about merchandise, branded clothing, printing and custom production.',sms:'Yes, Smerch (Trykeksperten ApS) may send me SMS offers, product news and inspiration about merchandise, branded clothing, printing and custom production.'}
};
export const dispatchPaymentText={da:'Beløbet reserveres ved bestilling og hæves automatisk, når hele ordren er afsendt, også for varer med logo eller tryk.',en:'Payment is authorised when ordering and captured automatically once the entire order has been dispatched, including goods with a logo or printing.'};
export function validateCheckoutConsent(input,now=Date.now(),{personalised=true,bankTransfer=false}={}){
 if(!input||input.version!==LEGAL_VERSION||input.accepted!==true||!['consumer','business'].includes(input.customerType)||!['da','en'].includes(input.locale))throw Error('Vælg kundetype og accepter de aktuelle handelsbetingelser.');
 if(personalised&&input.personalised!==true)throw Error('Bekræft vilkårene for personligt tilpassede varer.');

 return {version:LEGAL_VERSION,acceptedAt:new Date(now).toISOString(),customerType:input.customerType,locale:input.locale,accepted:true,prepayment:false,personalised,prepaymentText:'',captureTiming:bankTransfer?'bank_prepayment':'dispatch',paymentText:bankTransfer?'':dispatchPaymentText[input.locale]};
}
