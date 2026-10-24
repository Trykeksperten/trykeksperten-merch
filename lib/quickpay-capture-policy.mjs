// Clearhaus FAQ: capture within 179 days; late-capture fee/risk after seven days.
// This is a capture deadline, not a promise that the bank keeps funds reserved.
const day=86400000;
export function quickpayCaptureWindow(order,payment,{env=process.env,now=Date.now()}={}){
 const authorization=(payment.operations||[]).filter(o=>o.type==='authorize'&&!o.pending&&String(o.qp_status_code)==='20000'&&o.amount===order.totalIncVat).at(-1);
 const at=Date.parse(authorization?.created_at),acquirer=String(payment.acquirer||'').toLowerCase();
 const clearhaus=acquirer==='clearhaus'||acquirer==='clearhausfacilitator'||(!acquirer&&env.QUICKPAY_ACQUIRER==='clearhaus');
 if(clearhaus){
  if(!Number.isFinite(at)||at>now)return {valid:false,reason:'Quickpays autorisationstidspunkt mangler eller er ugyldigt.'};
  const expires=at+179*day;
  return {valid:payment.accepted===true&&expires>now+60000,expiresAt:new Date(expires).toISOString(),lateCapture:now>at+7*day,policy:'clearhaus-179-days',reason:'Hævningsfristen hos Clearhaus er udløbet, eller autorisationen er ikke accepteret.'};
 }
 const expires=Date.parse(order.authorizationExpiresAt);
 return {valid:payment.accepted===true&&Number.isFinite(expires)&&expires>now+60000,expiresAt:Number.isFinite(expires)?new Date(expires).toISOString():null,lateCapture:false,policy:'conservative',reason:'Reservationen er udløbet eller udløbstidspunkt mangler. Afstem betalingen.'};
}
