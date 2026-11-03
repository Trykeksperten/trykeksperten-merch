import {proofPrepayment} from '../dist/proof-payment-policy.mjs';
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
const lockedVAT='locked_vat_v1',legacyVAT='legacy_aggregate_v1';
// Exact half-up rounding of an integer share, including large valid quantities.
const share=(amount,numerator,denominator)=>Number((2n*BigInt(amount)*BigInt(numerator)+BigInt(denominator))/(2n*BigInt(denominator)));
function shipmentPriceBasis(order,previous){
 const ordered=order.lines||[],quotes=order.quote?.lines,freight=order.freightExVat,total=order.totalIncVat;
 if(!ordered.length||!Array.isArray(quotes)||quotes.length!==ordered.length||quotes.some(q=>!minor(q?.net))||ordered.some(l=>!Number.isSafeInteger(l.quantity)||l.quantity<=0)||!minor(freight)||!minor(total))throw Error('Ordretotal, linjebeløb og fragt skal afstemmes.');
 const merchandise=quotes.reduce((n,q)=>n+q.net,0);
 if(!minor(merchandise)||merchandise<=0||!minor(merchandise+freight))throw Error('Ordretotal og fragt skal afstemmes.');
 const known=quotes.map(q=>q.vat!==undefined||q.totalIncVat!==undefined),hasVAT=known.every(Boolean);
 if(known.some(Boolean)&&!hasVAT)throw Error('Den låste moms mangler på en ordrelinje. Afstem ordren.');
 const lineVAT=quotes.map(q=>hasVAT?(q.vat??q.totalIncVat-q.net):Math.round(q.net*.25));
 if(lineVAT.some((vat,i)=>!minor(vat)||vat!==Math.round(quotes[i].net*.25)||(quotes[i].totalIncVat!==undefined&&quotes[i].totalIncVat!==quotes[i].net+vat)))throw Error('Ordrelinjernes låste moms eller total skal afstemmes.');
 const goodsVAT=hasVAT?lineVAT.reduce((n,vat)=>n+vat,0):Math.round(merchandise*.25);
 for(const [key,value] of [['net',merchandise],['vat',goodsVAT],['totalIncVat',merchandise+goodsVAT]])if(order.quote[key]!==undefined&&order.quote[key]!==value)throw Error('Tilbuddets summer matcher ikke ordrelinjerne.');
 const freightVAT=order.freightIncVat===undefined?Math.round(freight*.25):order.freightIncVat-freight;
 if((order.freightIncVat!==undefined&&!minor(order.freightIncVat))||!minor(freightVAT)||freightVAT!==Math.round(freight*.25))throw Error('Fragtens låste moms skal afstemmes.');
 const aggregateTotal=merchandise+freight+Math.round((merchandise+freight)*.25);
 if(hasVAT?total!==merchandise+freight+goodsVAT+freightVAT:total!==aggregateTotal)throw Error('Ordren matcher ikke den understøttede danske momsopsætning.');
 // Keep already allocated historical amounts immutable. The old algorithm is
 // permitted only when its exact total and every prior allocation reconcile.
 const historical=previous.some(s=>!s.allocationBasis||s.allocationBasis===legacyVAT);
 const allocationBasis=!hasVAT||historical?legacyVAT:lockedVAT;
 if(previous.some(s=>s.allocationBasis&&s.allocationBasis!==allocationBasis)||(allocationBasis===legacyVAT&&total!==aggregateTotal))throw Error('Tidligere leverancers momsgrundlag kræver afstemning.');
 return {ordered,quotes,merchandise,freight,freightVAT,lineVAT,allocationBasis};
}

// Allocate the accepted line VAT and freight VAT, rather than recalculating VAT
// on a different aggregate. Cumulative shares leave no remainder at completion.
export function allocateShipment(order,previous,items){
 if(!Array.isArray(previous))throw Error('Tidligere leverancer skal afstemmes.');
 const basis=shipmentPriceBasis(order,previous),{ordered,quotes,merchandise,freight,freightVAT,lineVAT,allocationBasis}=basis;
 const quantities=ordered.map(()=>0);
 const netAt=qty=>quotes.reduce((sum,q,i)=>sum+share(q.net,qty[i],ordered[i].quantity),0);
 function allocate(requested){
  if(!Array.isArray(requested)||!requested.length)throw Error('Afsendte vareantal mangler; der må ikke gættes ud fra tracking.');
  const oldNet=netAt(quantities),seen=new Set();
  const lines=requested.map(item=>{
   const {index,quantity}=item,line=ordered[index];
   if(!Number.isSafeInteger(index)||!line||seen.has(index)||!Number.isSafeInteger(quantity)||quantity<=0||quantities[index]+quantity>line.quantity)throw Error('Afsendte antal eller linjebeløb kan ikke afstemmes.');
   seen.add(index);const before=quantities[index],after=before+quantity,net=share(quotes[index].net,after,line.quantity)-share(quotes[index].net,before,line.quantity);quantities[index]=after;
   const row={index,sku:line.sku,description:order.productNames?.[line.productId]||line.productName||line.productId,quantity,net};
   if(allocationBasis===lockedVAT){row.vat=share(lineVAT[index],after,line.quantity)-share(lineVAT[index],before,line.quantity);row.totalIncVat=net+row.vat;}
   return row;
  });
  const newNet=netAt(quantities),oldFreight=share(freight,oldNet,merchandise),newFreight=share(freight,newNet,merchandise),freightPart=newFreight-oldFreight,net=newNet-oldNet+freightPart;
  const freightVatPart=share(freightVAT,newNet,merchandise)-share(freightVAT,oldNet,merchandise);
  const vat=allocationBasis===lockedVAT?lines.reduce((n,l)=>n+l.vat,0)+freightVatPart:Math.round((newNet+newFreight)*.25)-Math.round((oldNet+oldFreight)*.25);
  return {allocationBasis,lines,freight:freightPart,...(allocationBasis===lockedVAT?{freightVat:freightVatPart}:{}),net,vat,total:net+vat};
 }
 for(const old of previous){
  const expected=allocate(old.lines);
  if(['freight','net','vat','total'].some(key=>old[key]!==expected[key])||old.lines.some((l,i)=>l.net!==expected.lines[i].net||(l.vat!==undefined&&l.vat!==expected.lines[i].vat))||(old.freightVat!==undefined&&old.freightVat!==expected.freightVat))throw Error('Tidligere leverancers beløb eller moms kræver afstemning.');
 }
 return allocate(items);
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
 if(captured>shipped&&!proofPrepayment(order))problems.push('Forudbetaling: afklar fakturering og moms særskilt.');
 if(refunded>credited)problems.push('Kreditnota mangler til registreret refundering.');
 const correctionCredits=documents.filter(d=>d.kind==='replacement'&&d.correctionPosting).reduce((n,d)=>n+d.total,0);
 if(credited-correctionCredits>refunded)problems.push('Kreditering og tilbagebetaling skal afstemmes.');
 if(refunded&&shipped<order.totalIncVat)problems.push('Refundering har lukket transaktionen for yderligere hævning. Restordre kræver ny betalingsaftale.');
 for(const mail of finance.mail||[])if(['failed','uncertain','sending'].includes(mail.status)||(mail.requiresReview&&!['sent','obsolete'].includes(mail.status)))problems.push(`${mail.kind==='accountant_basis'?'Fakturagrundlag':'Betalingskvittering'}: ${mail.error||'afventer manuel gennemgang'}`);
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
