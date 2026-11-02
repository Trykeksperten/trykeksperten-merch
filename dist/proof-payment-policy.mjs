import {productionPaymentActive} from './production-payment.mjs';
export const dispatchPayment=checkout=>(checkout?.legal?.captureTiming??checkout?.captureTiming)==='dispatch';
// Applies only to the payment timing explicitly accepted on this checkout.
export const proofPrepayment=checkout=>!dispatchPayment(checkout)&&(checkout?.legal?(checkout.legal.prepayment===true&&Boolean(checkout.legal.prepaymentText)&&Boolean(checkout.legal.acceptedAt)):checkout?.proofPrepayment===true);
export const staffProofApproved=order=>Boolean(order?.proof&&order.decision?.decision==='approve'&&order.decision.actor==='customer'&&order.decision.version===order.proof.version&&order.decision.proofHash===order.proof.hash&&order.decision.staffApproval?.version===order.proof.version&&order.decision.staffApproval?.proofHash===order.proof.hash&&order.decision.staffApproval?.performedBy?.type==='staff');
export function proofPaymentSettled(checkout){return checkout?.status==='paid'&&Boolean(checkout.paidAt)&&!(checkout.paymentTotals?.refunded>0);}

export function proofReleaseReady(checkout,order){return proofPrepayment(checkout)?proofPaymentSettled(checkout)&&staffProofApproved(order):productionPaymentActive(checkout)&&(!dispatchPayment(checkout)||(checkout?.status==='authorized'&&staffProofApproved(order)));}
