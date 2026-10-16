export function proofQueue(order){
 if(order.status==='proof_received')return order.proof?.customer?'customer':'smerch';
 if(order.status==='approval_pending_pf')return order.decision?.delivery?.reference?'pf':'smerch';
 if(order.status==='revision_requested')return order.decision?.delivery?.reference?'pf':'smerch';
 if(['prepared','needs_attention','needs_reconciliation'].includes(order.status))return 'smerch';
 if(['gateway_accepted','awaiting_proof'].includes(order.status))return 'pf';
 return 'production';
}
export function proofQueueLabel(order){return {customer:'Afventer kunde',smerch:'Kræver Smerch',pf:'Afventer PF',production:'Produktion / afsluttet'}[proofQueue(order)];}
