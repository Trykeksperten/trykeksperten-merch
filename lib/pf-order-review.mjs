import {productionPaymentActive} from './production-payment.mjs';
import {createHash} from 'node:crypto';
import {requiresPFReview,privateBlankReviewReason} from '../dist/pf-review-policy.mjs';
import {readCheckout,updateCheckout} from './checkout.mjs';
export function pfReviewKey(order){return createHash('sha256').update(JSON.stringify({id:order.id,type:order.legal?.customerType,lines:order.lines,goods:order.quote?.totalIncVat,total:order.totalIncVat,freight:order.freightIncVat,shipping:order.shipping})).digest('hex');}
export function pfReviewState(order){const required=requiresPFReview(order),key=pfReviewKey(order);return {required,key,goodsTotalIncVat:order.quote?.totalIncVat??null,approved:required&&order.pfReviewApproval?.key===key&&Boolean(order.pfReviewApproval.actor?.name),approvedBy:order.pfReviewApproval?.actor?.name||null,approvedAt:order.pfReviewApproval?.at||null,reason:required?privateBlankReviewReason:null};}
export function assertPFReviewApproved(order){const review=pfReviewState(order);if(review.required&&!review.approved)throw Error(privateBlankReviewReason);}
export async function holdForPFReview(id){
 const order=await readCheckout(id),review=pfReviewState(order);if(!review.required||review.approved)return false;
 await updateCheckout(id,current=>{const state=pfReviewState(current);if(!state.required||state.approved)return current;const at=new Date().toISOString();current.events??=[];if(!current.events.some(e=>e.type==='smerch_review_required'&&e.reviewKey===state.key))current.events.push({at,type:'smerch_review_required',reviewKey:state.key,reason:state.reason});current.pfHandoff={status:'awaiting_review',reason:state.reason};return current;});
 return true;
}
export async function approvePFReview(id,{expectedKey,actor,now=Date.now()}={}){
 if(!actor?.name||actor.type!=='staff')throw Error('Medarbejderlogin kræves for at godkende ordren.');
 return updateCheckout(id,order=>{const review=pfReviewState(order);if(!review.required)throw Error('Ordren kræver ikke denne gennemgang.');if(review.key!==expectedKey)throw Error('Ordren er ændret. Genindlæs og gennemgå den igen.');if(order.adminTest||order.adminLiveTest||!productionPaymentActive(order,now+60000))throw Error('En aktiv og gyldig betalingsreservation kræves.');if(order.pfOrderIds?.length)throw Error('PF-tilknytningen skal afstemmes, før ordren kan godkendes.');if(review.approved)return order;const at=new Date(now).toISOString();order.pfReviewApproval={key:review.key,at,actor:{type:'staff',name:actor.name}};order.pfHandoff={status:'review_approved',reason:'Godkendt af Smerch. Klar til PF.'};order.events??=[];order.events.push({at,type:'smerch_review_approved',performedBy:order.pfReviewApproval.actor,reviewKey:review.key});return order;});
}
