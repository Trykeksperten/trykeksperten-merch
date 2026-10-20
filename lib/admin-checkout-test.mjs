export function adminCheckoutTestReady(env=process.env){
 return env.PAYMENT_PROVIDER==='quickpay'&&env.QUICKPAY_MODE==='test'&&env.QUICKPAY_LIVE_ENABLED==='0'&&env.QUICKPAY_CAPTURE_ENABLED==='0'&&env.PF_GATEWAY_MODE==='test'&&env.PF_AUTO_SUBMIT_ENABLED==='0';
}
export function assertAdminCheckoutTest(authenticated,env=process.env){
 if(!authenticated)throw Error('Administratoradgang kræves.');
 if(!adminCheckoutTestReady(env))throw Error('Betalingstest kræver QuickPay og PF i testtilstand samt livebetaling, hævning og automatisk PF-afsendelse slået fra.');
}
