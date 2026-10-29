// Sales ledger is separate from payment state. All monetary values are integer øre.
export const seller={brand:'Smerch',name:'Trykeksperten ApS',cvr:'44015773',address:'Raffinaderivej 20, 2300 København S'};
const minor=n=>Number.isSafeInteger(n)&&n>=0;
export function invoicePolicy(order){
 const country=String(order.billing?.country||order.shipping?.country||'').toUpperCase();
 const domestic=country==='DK'&&String(order.shipping?.country||'').toUpperCase()==='DK';
 const type=domestic&&order.legal?.customerType==='consumer'&&!order.finance?.fullInvoiceRequested?'simplified':'full';
 const problems=[];
 if(!domestic)problems.push('Udlandssalg: Financial Outsourcing skal godkende momsopsætning før fakturering og hævning.');
 if(!['consumer','business'].includes(order.legal?.customerType))problems.push('Kundetype mangler.');
 if(type==='full'){
  const b=order.billing||{};
  for(const [key,label] of [['company','Fakturamodtager'],['street','Fakturaadresse'],['postalCode','Postnummer'],['city','By'],['country','Land'],['email','Faktura-e-mail']])if(!b[key])problems.push(label+' mangler.');
 }
 return {type,country,domestic,problems};
}
// Cumulative allocation avoids rounding drift. Quoted line net already includes discounts/print/setup.
export function allocateShipment(order,previous,items){
 if(!Array.isArray(items)||!items.length)throw Error('Afsendte vareantal mangler; der må ikke gættes ud fra tracking.');
 const ordered=order.lines||[],prior=ordered.map((_,i)=>previous.reduce((n,s)=>n+(s.lines.find(l=>l.index===i)?.quantity||0),0));
 const seen=new Set();const lines=items.map(item=>{
  const index=item.index,quantity=item.quantity,line=ordered[index],net=order.quote?.lines?.[index]?.net;
  if(!line||seen.has(index)||!Number.isSafeInteger(quantity)||quantity<=0||!minor(net)||!Number.isSafeInteger(line.quantity)||line.quantity<=0||prior[index]+quantity>line.quantity)throw Error('Afsendte antal eller linjebeløb kan ikke afstemmes.');
  seen.add(index);const part=Math.round(net*(prior[index]+quantity)/line.quantity)-Math.round(net*prior[index]/line.quantity);
  return {index,sku:line.sku,description:order.productNames?.[line.productId]||line.productName||line.productId,quantity,net:part};
 });
 const merchandise=order.quote.lines.reduce((n,l)=>n+l.net,0),freight=order.freightExVat,total=order.totalIncVat;
 if(!minor(freight)||!minor(total)||merchandise<=0)throw Error('Ordretotal og fragt skal afstemmes.');
 const oldNet=previous.reduce((n,s)=>n+s.lines.reduce((v,l)=>v+l.net,0),0),newNet=oldNet+lines.reduce((n,l)=>n+l.net,0);
 const freightShare=Math.round(freight*newNet/merchandise)-Math.round(freight*oldNet/merchandise),net=lines.reduce((n,l)=>n+l.net,0)+freightShare;
 // Existing Danish goods checkout uses 25% VAT. Foreign orders are explicitly blocked by policy.
 if(Math.round((merchandise+freight)*1.25)!==total)throw Error('Ordren matcher ikke den understøttede danske momsopsætning.');
 const oldGross=previous.reduce((n,s)=>n+s.total,0),cumulativeNet=previous.reduce((n,s)=>n+s.net,0)+net;
 const gross=Math.round(cumulativeNet*1.25)-oldGross;
 return {lines,freight:freightShare,net,vat:gross-net,total:gross};
}
export function quickpayTotals(payment){
 const seen=new Set(),rows=[];
 for(const op of payment.operations||[]){
  if(!['capture','refund'].includes(op.type)||op.pending||String(op.qp_status_code)!=='20000')continue;
  if(!Number.isSafeInteger(op.id)||!minor(op.amount)||op.amount===0)throw Error('Ugyldig betalingsoperation.');
  const key=String(op.id);if(seen.has(key))throw Error('Gentaget betalingsoperation i udbydersvar.');seen.add(key);rows.push({id:op.id,type:op.type,amount:op.amount,at:op.created_at||null});
 }
 const captured=rows.filter(r=>r.type==='capture').reduce((n,r)=>n+r.amount,0),refunded=rows.filter(r=>r.type==='refund').reduce((n,r)=>n+r.amount,0);
 if(refunded>captured)throw Error('Refundering overstiger hævning.');
 return {captured,refunded,netPaid:captured-refunded,rows,pending:(payment.operations||[]).some(o=>o.pending),captureClosed:rows.some(r=>r.type==='refund')||(payment.operations||[]).some(o=>o.type==='cancel'&&!o.pending&&String(o.qp_status_code)==='20000')};
}
export function financeSummary(order,finance){
 const shipments=finance.shipments||[],documents=finance.documents||[],payments=finance.payments||[];
 const sum=(rows,key)=>rows.reduce((n,r)=>n+(r[key]||0),0);
 const captured=sum(payments.filter(p=>p.type==='capture'),'amount'),refunded=sum(payments.filter(p=>p.type==='refund'),'amount');
 const shipped=sum(shipments,'total'),invoiced=sum(documents.filter(d=>d.kind==='invoice'||d.kind==='replacement'&&d.correctionPosting),'total'),credited=sum(documents.filter(d=>d.kind==='credit'),'total');
 const settled=sum(finance.settlements||[],'gross'),problems=[...invoicePolicy({...order,finance}).problems,...(finance.problems||[])];
 // External bookkeeping does not gate capture or require an invoice returned to Smerch.
 if(shipped>captured)problems.push('Hævning af afsendte varer afventer.');
 if(captured>shipped)problems.push('Forudbetaling: afklar fakturering og moms særskilt.');
 if(refunded>credited)problems.push('Kreditnota mangler til registreret refundering.');
 const correctionCredits=documents.filter(d=>d.kind==='replacement'&&d.correctionPosting).reduce((n,d)=>n+d.total,0);
 if(credited-correctionCredits>refunded)problems.push('Kreditering og tilbagebetaling skal afstemmes.');
 if(refunded&&shipped<order.totalIncVat)problems.push('Refundering har lukket transaktionen for yderligere hævning. Restordre kræver ny betalingsaftale.');
 for(const mail of finance.mail||[])if(['failed','uncertain','sending'].includes(mail.status)||(mail.requiresReview&&mail.status!=='sent'))problems.push(`${mail.kind==='accountant_basis'?'Fakturagrundlag':'Betalingskvittering'}: ${mail.error||'afventer manuel gennemgang'}`);
 for(const op of finance.operations||[])if(op.status!=='confirmed')problems.push(`${op.kind}: ${op.error||op.status}`);
 return {ordered:order.totalIncVat,shipped,remaining:order.totalIncVat-shipped,invoiced,credited,captured,refunded,netPaid:captured-refunded,unallocated:captured-settled,held:sum(finance.settlements||[],'held'),unsettled:captured-refunded-settled+sum(finance.settlements||[],'refunds')+sum(finance.settlements||[],'held'),problems:[...new Set(problems)]};
}
export function validateSettlement(input){
 for(const key of ['gross','refunds','fees','bank'])if(!minor(input[key]))throw Error('Afregningsbeløb skal angives i øre.');
 for(const key of ['adjustments','held'])if(!Number.isSafeInteger(input[key]))throw Error('Regulering og tilbageholdelse skal angives i øre.');
 if(input.gross-input.refunds-input.fees+input.adjustments-input.held!==input.bank)throw Error('Afregningen stemmer ikke med bankudbetalingen.');
 for(const key of ['reference','bankReference','economicReference'])if(typeof input[key]!=='string'||!input[key].trim())throw Error('Afregnings-, bank- og bogføringsreference kræves.');
 return input;
}
