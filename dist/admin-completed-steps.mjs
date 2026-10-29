// Completion is derived from recorded outcomes, never from an available button.
export function completedSteps(order,checkout,context=order.attention||{}){
 const rows=[],add=(id,tab,title,at,to)=>rows.push({id,tab,title,at,to});
 const p=order.proof,d=order.decision,current=d&&Number(d.version)===Number(p?.version);
 if(p)add('proof-received','proof','Korrektur modtaget fra PF',p.receivedAt);
 if(current){add('customer-decision','proof',d.actor==='customer'?(d.decision==='approve'?'Kundens godkendelse modtaget':'Kundens ændringsønske modtaget'):'Korrektursvar registreret',d.createdAt);
 if(d.staffApproval&&Number(d.staffApproval.version)===Number(p.version))add('staff-approved','proof','Godkendt hos Smerch',d.staffApproval.at);
 if(d.delivery?.reference||d.apiDispatch?.state==='delivered')add('pf-sent','proof','Korrektursvar sendt til PF',d.apiDispatch?.deliveredAt);
 }
 if(p?.approvalReference)add('pf-approved','proof','Godkendelse bekræftet af PF');
 const mailNames={invitation:'Korrekturmail',receipt:'Kvittering for korrektursvar',staff_decision:'Intern besked om korrektursvar',confirmation:'Ordrebekræftelse',tracking:'Trackingmail',invoice:'Fakturamail',payment_receipt:'Betalingskvittering',accountant_basis:'Fakturagrundlag til bogholder',refund_basis:'Refunderingsgrundlag'};
 const mails=[...(context.confirmation?[{...context.confirmation,kind:'confirmation'}]:[]),...(context.shipments||[]).map(m=>({...m,kind:'tracking'})),...(context.proofs||[]).filter(m=>Number(m.version)===Number(p?.version)),...(context.finance?.mail||[]),...(context.correspondence||[]).filter(m=>m.kind==='email')];
 const latestBasis=(context.documents?.documents||[]).filter(x=>x.type==='basis').sort((a,b)=>(b.version||0)-(a.version||0))[0];
 const seen=new Set();
 for(const m of mails){if(m.status!=='sent')continue;if(m.documentId&&latestBasis&&m.audience==='accountant'&&m.documentId!==latestBasis.id)continue;
 const kind=m.action||m.kind,title=m.audience==='accountant'&&m.documentId?'Fakturagrundlag til bogholder':mailNames[kind]||'Besked',key=[m.key||m.id||kind,m.to,m.sentAt||m.lastSentAt||''].join('|');if(seen.has(key))continue;seen.add(key);add('mail-'+key,'documents',title+' sendt',m.sentAt||m.lastSentAt,m.to);
 }
 const s=context.finance?.summary;
 if(s?.captured>0)add('capture','documents',s.ordered>0&&s.captured>=s.ordered?'Betaling hævet':'Delbetaling hævet');
 if(s?.refunded>0)add('refund','documents','Refundering registreret');
 for(const x of context.finance?.shipments||[])if(x.invoiceStatus==='issued')add('invoice-'+x.key,'documents','Faktura registreret hos bogholder');
 if(order.status==='shipped')add('shipped','summary','Afsendelse registreret',order.shipment?.shipDate);
 return rows;
}
