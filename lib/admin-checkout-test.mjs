export function adminCheckoutTestReady(env=process.env){
 return env.PAYMENT_PROVIDER==='quickpay'&&env.QUICKPAY_MODE==='test'&&env.QUICKPAY_LIVE_ENABLED==='0'&&env.QUICKPAY_CAPTURE_ENABLED==='0'&&env.PF_GATEWAY_MODE==='test'&&env.PF_AUTO_SUBMIT_ENABLED==='0';
}
export function assertAdminCheckoutTest(authenticated,env=process.env){
 if(!authenticated)throw Error('Administratoradgang kræves.');
 if(!adminCheckoutTestReady(env))throw Error('Betalingstest kræver QuickPay og PF i testtilstand samt livebetaling, hævning og automatisk PF-afsendelse slået fra.');
}

// A server-created marker permanently isolates these reservations from commerce.
export const LIVE_TEST_AMOUNT = 500;
export function isAdminLiveTest(order){return order.adminTest===true&&order.adminLiveTest===true&&order.totalIncVat===LIVE_TEST_AMOUNT;}
export function assertAdminLiveTest(authenticated,env=process.env){
 assertAdminCheckoutTest(authenticated,env);
 for(const base of [env.SMERCH_PUBLIC_BASE_URL,env.SMERCH_CUSTOMER_BASE_URL||env.SMERCH_PUBLIC_BASE_URL]){
  const url=new URL(base);if(url.protocol!=='https:'||url.username||url.password)throw Error('Live-test kræver HTTPS.');
 }
 if(!env.QUICKPAY_API_KEY||!env.QUICKPAY_PRIVATE_KEY)throw Error('QuickPay-nøgler mangler.');
}
export function prepareAdminLiveTest(order){
 order.adminTest=true;order.adminLiveTest=true;order.testOriginalTotalIncVat=order.totalIncVat;order.totalIncVat=LIVE_TEST_AMOUNT;return order;
}

// A pilot is a real order at its full price, never the isolated 5 kr test.
export function assertAdminPilot(authenticated,env=process.env){
 if(!authenticated)throw Error('Administratoradgang kræves.');
 const required={SMERCH_ADMIN_PILOT_ENABLED:'1',PAYMENT_PROVIDER:'quickpay',QUICKPAY_MODE:'live',QUICKPAY_LIVE_ENABLED:'1',QUICKPAY_CAPTURE_ENABLED:'1',PF_GATEWAY_MODE:'live',PF_GATEWAY_LIVE_ENABLED:'1',PF_AUTO_SUBMIT_ENABLED:'1',PF_COMMUNICATION_EMAIL_ACTIVE:'1',PF_WHITE_LABEL_CONFIRMED:'1',PF_PROOF_DELIVERY_CONFIRMED:'1'};
 const missing=Object.keys(required).filter(key=>env[key]!==required[key]);
 if(missing.length)throw Error('Rigtig testordre er låst, indtil PF, kortbetaling og den interne testadgang er godkendt og aktiveret.');
 if(env.PF_COMMUNICATION_EMAIL!=='korrektur@smerch.dk')throw Error('Kontrollér PF-korrekturadressen.');
 const hours=Number(env.QUICKPAY_AUTH_HOLD_HOURS),limit=Number(env.SMERCH_ADMIN_PILOT_MAX_DKK);
 if(!Number.isFinite(hours)||hours<=0||hours>168)throw Error('En verificeret reservationsfrist kræves.');
 if(!Number.isFinite(limit)||limit<=0)throw Error('Angiv beløbsgrænsen for den rigtige testordre.');
}
export function prepareAdminPilot(order,env=process.env){
 assertAdminPilot(true,env);
 if(!Number.isSafeInteger(order.totalIncVat)||order.totalIncVat<=0||order.totalIncVat>Math.round(Number(env.SMERCH_ADMIN_PILOT_MAX_DKK)*100))throw Error('Ordren overstiger testens beløbsgrænse.');
 if(!order.lines?.length||order.lines.some(line=>!line.decorations?.some(deco=>deco.artworks?.length)))throw Error('Den rigtige testordre skal have logo på alle varelinjer.');
 order.adminPilot=true;order.adminTest=false;return order;
}
