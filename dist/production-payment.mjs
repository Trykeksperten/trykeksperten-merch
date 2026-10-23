export function productionPaymentActive(order,now=Date.now()){
 return order?.status==='paid'||(order?.status==='authorized'&&Number.isFinite(Date.parse(order.authorizationExpiresAt))&&Date.parse(order.authorizationExpiresAt)>now);
}
