export const LEGAL_VERSION='2026-10-01';
export const MARKETING_VERSION='2026-10-01';
export const marketingConsent={
 da:{email:'Ja tak, Smerch (Trykeksperten ApS) må sende mig tilbud, produktnyheder og inspiration om merchandise, profilbeklædning, tryk og specialproduktion via e-mail.',sms:'Ja tak, Smerch (Trykeksperten ApS) må sende mig tilbud, produktnyheder og inspiration om merchandise, profilbeklædning, tryk og specialproduktion via SMS.'},
 en:{email:'Yes, Smerch (Trykeksperten ApS) may email me offers, product news and inspiration about merchandise, branded clothing, printing and custom production.',sms:'Yes, Smerch (Trykeksperten ApS) may send me SMS offers, product news and inspiration about merchandise, branded clothing, printing and custom production.'}
};
export const prepaymentConsent={da:'Jeg accepterer, at betalingen for mine personligt tilpassede varer hæves efter min godkendelse af produktionskorrekturen og før produktion, fordi varerne fremstilles særligt til mig.',en:'I agree that payment for my personalised goods will be captured after I approve the production proof and before production, because the goods are made specifically for me.'};
export function validateCheckoutConsent(input,now=Date.now()){
 if(!input||input.version!==LEGAL_VERSION||input.accepted!==true||!['consumer','business'].includes(input.customerType)||!['da','en'].includes(input.locale))throw Error('Vælg kundetype og accepter de aktuelle handelsbetingelser.');
 if(input.prepayment!==true||input.personalised!==true)throw Error('Bekræft vilkårene for personligt tilpassede varer og forudbetaling.');
 return {version:LEGAL_VERSION,acceptedAt:new Date(now).toISOString(),customerType:input.customerType,locale:input.locale,accepted:true,prepayment:true,personalised:true,prepaymentText:prepaymentConsent[input.locale]};
}
