const methods=['creditcard','mobilepay','apple-pay','google-pay'];

export function quickpayMethodSetting(env){
 return env.QUICKPAY_PAYMENT_METHODS||'mobilepay,apple-pay,google-pay,creditcard';
}
export function quickpayCheckoutMethods(env){
 const configured=quickpayMethodSetting(env).split(',').map(value=>value.trim());
 // Preserve custom filters and exclusions in the hosted window.
 return configured.every(value=>methods.includes(value))?methods.filter(method=>configured.includes(method)):[];
}
export function validateQuickpayMethod(method,env){
 if(!quickpayCheckoutMethods(env).includes(method))throw Error('Den valgte onlinebetalingsmetode er ikke tilgængelig. Vælg en anden betalingsmetode.');
 return method;
}
