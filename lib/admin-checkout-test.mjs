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
