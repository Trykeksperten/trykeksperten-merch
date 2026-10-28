import {readCheckout} from './checkout.mjs';
export const standaloneProofTest=order=>!order.checkoutId&&order.gatewayPayload?.Header?.isTest===true;
export async function proofRecipient(order){
 if(order.checkoutId)return readCheckout(order.checkoutId);
 if(!standaloneProofTest(order))throw Error('Korrekturen mangler en tilknyttet kundeordre.');
 return {shipping:order.shipping,lines:order.lines,productNames:{},pfOrderIds:[order.id],status:'authorized'};
}
