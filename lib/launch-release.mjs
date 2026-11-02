import {launchConfig} from '../dist/launch-config.mjs';
// Code deployment and the countdown never release orders. This release is
// scoped to the approved start with manual finance and reviewed proof/shipping.
export function checkoutLaunchConfiguration({env=process.env,payment,handoff,mailReady=false,automation,mailboxPaused}={}){
 const manualFinance=env.SMERCH_FINANCE_ENABLED==='1'&&env.SMERCH_PAYMENT_AGREEMENT_CONFIRMED==='1'&&env.SMERCH_AUTOMATIC_SHIPMENT_CAPTURE==='0'&&env.SMERCH_PAYMENT_RECEIPT_MAIL==='review'&&env.SMERCH_ACCOUNTANT_MAIL==='review';
 const reviewedMail=automation?.proofMailboxEnabled===true&&mailboxPaused===false&&automation.supplierCustomerMail==='disabled'&&automation.proofPublication==='review'&&automation.shipmentMail==='review'&&automation.confirmationMail==='automatic'&&automation.decisionReceipt==='automatic';
 return Object.freeze({...launchConfig,ordersEnabled:env.SMERCH_ORDERS_ENABLED==='1'&&manualFinance&&reviewedMail&&payment?.ready===true&&payment.mode==='live'&&handoff?.ready===true&&handoff.mode==='live'&&mailReady===true});
}
