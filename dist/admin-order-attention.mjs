import {isTestOrder,nextStep} from './admin-order-state.mjs';
// A saved document is not a send. Match the exact latest basis and accountant audience.
export function basisDelivery(context={}){
 const latest=(context.documents?.documents||[]).filter(d=>d.type==='basis').sort((a,b)=>(b.version||0)-(a.version||0))[0];
 if(!latest)return null;
 return (context.correspondence||[]).filter(m=>m.documentId===latest.id&&m.audience==='accountant'&&['sent','sending','uncertain'].includes(m.status)).sort((a,b)=>String(b.sentAt||b.createdAt||'').localeCompare(String(a.sentAt||a.createdAt||'')))[0]||null;
}
const actionable=new Set(['review','blocked','failed','uncertain']);
export function orderTasks(order,checkout,context=order.attention||{}){
 if(order.status==='cancelled')return [];
 const tasks=[],add=(id,tab,title,detail='',error=false)=>tasks.push({id,tab,title,detail,error});
 const proof=order.proof,decision=order.decision,current=decision&&Number(decision.version)===Number(proof?.version),sent=current&&(decision.delivery?.reference||decision.apiDispatch?.state==='delivered'),confirmed=proof?.approvalReference;
 if(order.proofIntakeProblems?.length)add('intake','proof','Afklar korrekturen fra PF',order.proofIntakeProblems.join(' '),true);
 if(proof&&!current&&order.status==='proof_received'&&!proof.customer)add('publish','proof','Gennemgå ny korrektur fra PF','Send korrekturen til kunden efter gennemgang.');
 if(current&&!confirmed){
  if(decision.apiDispatch?.state==='uncertain')add('pf-uncertain','proof','Afstem korrektursvaret med PF','Udfaldet er ukendt. Kontrollér hos PF før et nyt forsøg.',true);
  else if(!sent)add('decision','proof',decision.decision==='approve'?'Kunden har godkendt – afventer Smerch':'Kunden ønsker ændringer',isTestOrder(order,checkout)?'Testordre: gennemgå svaret. Ingen betaling eller produktionsfrigivelse.':decision.decision==='approve'?'Gennemgå korrekturen og betalingen, før svaret sendes til PF.':'Gennemgå kommentaren og send ændringsønsket til PF.');
 }
 const rows=[...(context.proofs||[]).filter(m=>Number(m.version)===Number(proof?.version)),...(context.shipments||[]),...(context.confirmation?[{...context.confirmation,kind:'confirmation'}]:[]),...(context.finance?.mail||[]),...(context.correspondence||[]).filter(m=>m.kind==='email')];
 for(const [i,m] of rows.entries())if(actionable.has(m.status))add('mail-'+(m.key||m.id||i),'documents',m.status==='review'?'Gennemse og send mail':'Mail kræver opfølgning',[(m.kind==='invitation'?'Korrekturmail':m.kind==='confirmation'?'Ordrebekræftelse':m.kind==='accountant_basis'?'Fakturagrundlag til bogholder':'Besked'),m.to,m.error].filter(Boolean).join(' · '),m.status!=='review');
 const financeProblems=[...new Set(context.finance?.summary?.problems||checkout?.finance?.problems||[])];
 if(financeProblems.length)add('finance','documents','Afklar fakturering og betaling',financeProblems.join(' '),true);
 for(const shipment of context.finance?.shipments||[])if(shipment.invoiceStatus!=='issued'&&!basisDelivery(context)&&!context.finance?.mail?.some(m=>m.shipmentKey===shipment.key&&['sent','confirmed','pending','sending','review','uncertain','failed','blocked'].includes(m.status)))add('basis-'+shipment.key,'documents','Send fakturagrundlag til bogholder','Gennemgå grundlaget og afsendelsen.');
 const latestBasis=(context.documents?.documents||[]).filter(d=>d.type==='basis').sort((a,b)=>(b.version||0)-(a.version||0))[0];
 if(latestBasis&&!isTestOrder(order,checkout)&&!tasks.some(t=>t.id.startsWith('basis-')||t.detail.includes('Fakturagrundlag'))&&!basisDelivery(context)&&!context.finance?.mail?.some(m=>m.kind==='accountant_basis'&&['sent','sending','review','uncertain'].includes(m.status)))add('document-'+latestBasis.id,'documents','Gennemse og send fakturagrundlag','Den seneste PDF-version er ikke registreret som sendt til bogholder.');
 if(context.error)add('load','history','Opgavestatus kunne ikke indlæses','Opdatér siden. Der kan være flere opgaver.',true);
 if(!tasks.length&&!isTestOrder(order,checkout)){const effectiveCheckout=context.finance?.summary?{...checkout,finance:context.finance.summary}:checkout;const [owner,detail]=nextStep(order,effectiveCheckout,context.shipments||[]);if(owner==='Smerch')add('next','summary','Ordren kræver handling',detail);}
 return tasks.filter((task,index)=>tasks.findIndex(other=>other.id===task.id)===index);
}
export function proofStages(order){const p=order.proof,d=order.decision,current=d&&Number(d.version)===Number(p?.version);return [
 ['Kunden',current&&d.actor==='customer'?(d.decision==='approve'?'Godkendt':'Ændringer ønsket'):p?.customer?'Afventer svar':'Ikke sendt til kunden'],
 ['Smerch',current&&d.staffApproval&&Number(d.staffApproval.version)===Number(p?.version)?'Godkendt':p?.approvalReference||(current&&(d.delivery?.reference||d.apiDispatch?.state==='delivered'))?'Afsluttet i tidligere forløb':current?'Afventer gennemgang':'Afventer kundens svar'],
 ['Svar til PF',current&&(d.delivery?.reference||d.apiDispatch?.state==='delivered')?'Sendt':d?.apiDispatch?.state==='uncertain'?'Skal afstemmes':'Ikke sendt'],
 ['PF',p?.approvalReference?'Godkendelse bekræftet':current&&(d.delivery?.reference||d.apiDispatch?.state==='delivered')?'Afventer bekræftelse':'Afventer svar fra Smerch']];}
// Semantic fingerprints ignore repeated timestamps for unchanged supplier status.
export function newsFingerprint(o){return JSON.stringify([o.proof?.version,o.decision?.version,o.decision?.decision,o.decision?.comment,o.proof?.approvalReference,o.pfStatus,o.status,o.expectedShipDate,o.shipment?.trackingDetails]);}
export function hasUnread(o){try{return localStorage.getItem('smerch-order-seen:'+o.id)!==newsFingerprint(o);}catch{return false;}}
export function markRead(o){try{localStorage.setItem('smerch-order-seen:'+o.id,newsFingerprint(o));}catch{}}
export async function loadAttention(order,api){const paths=['automation','documents','correspondence',...(order.checkoutId?['finance']:[])],results=await Promise.allSettled(paths.map(p=>api(`/api/pf-orders/${order.id}/${p}`).then(async r=>{if(r.ok===false)throw Error('Kunne ikke hente '+p);const data=await r.json();if(data?.error)throw Error(data.error);return data;})));const data={};for(let i=0;i<paths.length;i++){if(results[i].status==='rejected'){data.error=true;continue;}if(paths[i]==='automation')Object.assign(data,results[i].value);else data[paths[i]]=results[i].value;}return data;}
export async function loadOrderAttention(orders,api){let index=0;await Promise.all(Array.from({length:Math.min(4,orders.length)},async()=>{while(index<orders.length){const o=orders[index++];o.attention=await loadAttention(o,api);}}));}
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
export function attentionPanel(order,checkout,tasks,onSelect){const root=el('section',null,'order-attention');root.setAttribute('aria-label','Næste handling');root.append(el('h3',tasks.length?`Kræver handling · ${tasks.length}`:'Ingen handling lige nu'));if(isTestOrder(order,checkout))root.append(el('p','Testordre – ingen betaling eller produktionsfrigivelse.'));for(const task of tasks){const row=el('div',null,'attention-task'+(task.error?' attention-error':'')),button=el('button',task.title);button.type='button';button.onclick=()=>onSelect(task.tab);row.append(button,el('p',task.detail));root.append(row);}if(!tasks.length)root.append(el('p',nextStep(order,checkout,order.attention?.shipments||[])[1]));if(order.proof){const stages=el('div',null,'attention-stages');for(const [label,value] of proofStages(order))stages.append(el('p',label+': '+value));root.append(stages);}if(hasUnread(order)){const row=el('div',null,'attention-news'),button=el('button','Markér nyt som læst');button.type='button';row.append(el('span','Nyt siden sidst på denne browser'),button);button.onclick=()=>{markRead(order);row.remove();};root.append(row);}return root;}
