// Receiving a proof never approves it or releases production.
export function canReceiveProof(order){
 if(['gateway_accepted','awaiting_proof','proof_received','revision_requested','approval_pending_pf','approval_recorded'].includes(order.status))return true;
 // PF can report PROCESSING/STALLED while the first proof is still being prepared.
 return order.status==='needs_attention'&&Boolean(order.pfOrderNumber)&&['PROCESSING','STALLED'].includes(order.pfStatus)&&!order.shipment?.shipDate&&!order.proof?.approvalReference;
}
