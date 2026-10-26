// Customer return pages and API callbacks can use separate, explicitly configured origins.
export function paymentOrigins(env=process.env){
 const api=new URL(env.SMERCH_PUBLIC_BASE_URL),customer=new URL(env.SMERCH_CUSTOMER_BASE_URL||api.origin);
 for(const url of [api,customer])if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Betaling kræver gyldige webadresser.');
 return {api:api.origin,customer:customer.origin};
}
export function checkoutRequestAuthorized(req,env=process.env){
 try{const origins=paymentOrigins(env);return req.headers.origin===origins.customer&&[new URL(origins.api).host,new URL(origins.customer).host].includes(req.headers.host);}catch{return false;}
}

// Admin screens are served by the backend host, which may differ from the shop.
// Authentication is checked separately; this only validates the browser origin.
export function adminRequestOriginAllowed(req){
 const {origin,host}=req.headers;
 return typeof host==='string'&&!!host&&(origin===`https://${host}`||origin===`http://${host}`);
}
