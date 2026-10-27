export const LEGAL_VERSION='2026-10-27';
export const MARKETING_VERSION='2026-10-01';
export const marketingConsent={
 da:{email:'Ja tak, Smerch (Trykeksperten ApS) må sende mig tilbud, produktnyheder og inspiration om merchandise, profilbeklædning, tryk og specialproduktion via e-mail.',sms:'Ja tak, Smerch (Trykeksperten ApS) må sende mig tilbud, produktnyheder og inspiration om merchandise, profilbeklædning, tryk og specialproduktion via SMS.'},
 en:{email:'Yes, Smerch (Trykeksperten ApS) may email me offers, product news and inspiration about merchandise, branded clothing, printing and custom production.',sms:'Yes, Smerch (Trykeksperten ApS) may send me SMS offers, product news and inspiration about merchandise, branded clothing, printing and custom production.'}
};
export const prepaymentConsent={da:'Jeg accepterer, at betalingen for mine personligt tilpassede varer hæves efter min godkendelse af produktionskorrekturen og Smerchs interne godkendelse, før svaret sendes til produktionspartneren og produktionen starter, fordi varerne fremstilles særligt til mig.',en:'I agree that payment for my personalised goods will be captured after I approve the production proof and Smerch completes its internal approval, before approval is sent to the production partner and production starts, because the goods are made specifically for me.'};
export function validateCheckoutConsent(input,now=Date.now(),{personalised=true,bankTransfer=false}={}){
 if(!input||input.version!==LEGAL_VERSION||input.accepted!==true||!['consumer','business'].includes(input.customerType)||!['da','en'].includes(input.locale))throw Error('Vælg kundetype og accepter de aktuelle handelsbetingelser.');
 if(personalised&&input.personalised!==true)throw Error('Bekræft vilkårene for personligt tilpassede varer.');
 if(personalised&&!bankTransfer&&input.prepayment!==true)throw Error('Acceptér hævning efter din korrekturgodkendelse og Smerchs godkendelse, før produktion.');
 const prepayment=personalised&&!bankTransfer;
 return {version:LEGAL_VERSION,acceptedAt:new Date(now).toISOString(),customerType:input.customerType,locale:input.locale,accepted:true,prepayment,personalised,prepaymentText:prepayment?prepaymentConsent[input.locale]:''};
}
