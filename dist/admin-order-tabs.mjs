import {completedSteps} from './admin-completed-steps.mjs';
import {orderTasks,hasUnread,markRead} from './admin-order-attention.mjs';
// Presentation only: switching tabs never sends a message or changes an order.
const selections=new Map();
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
export function compactOrderWorkspace(box,{order,checkout,products,overview,supplierDocs,documents,contact,automation,history,events,paymentAttempts,proofNodes=[],actions,decision}){
 const workspace=el('div',null,'order-tab-workspace'),tabs=el('div',null,'order-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Ordreområder');
 const panels=new Map(),buttons=new Map(),tasks=orderTasks(order,checkout),completed=completedSteps(order,checkout);
 const summary=el('div',null,'order-summary-layout');summary.append(products,overview);
 documents.open=contact.open=true;
 if(documents.children[0]?.tagName==='SUMMARY')documents.children[0].textContent='Dokumenter og tidligere afsendelser';
 const proof=el('div',null,'order-proof-layout'),visual=el('section',null,'order-proof-visual'),controls=el('section',null,'order-proof-controls');
 const proofHeader=el('div',null,'order-proof-heading'),previewNodes=proofNodes.filter(node=>(node.className||'').split(' ').includes('preview'));if(previewNodes.length){proofHeader.append(...proofNodes.filter(node=>!previewNodes.includes(node)));proof.append(proofHeader);visual.append(...previewNodes);proof.className+=' has-proof-heading';}else visual.append(...proofNodes);if(!proofNodes.length)visual.append(el('p','Ingen korrektur modtaget endnu.','muted'));
 if(decision)controls.append(decision);if(actions){actions.open=true;const primary=actions.querySelector('.order-primary-task');if(primary)actions.insertBefore(primary,actions.children[1]||null);controls.append(actions);}if(!controls.childElementCount)controls.append(el('p','Ingen korrekturhandling afventer.','muted'));proof.append(visual,controls);
 const resend=contact.querySelector('.order-resend'),mailHost=documents.querySelector('.document-mail-review');if(resend&&mailHost)mailHost.append(resend);
 const finance=documents.querySelector('.order-finance-controls');
 const hub=el('section',null,'order-action-hub'),pending=el('div',null,'order-action-buttons');
 hub.append(el('h3','Handlinger'),el('p',tasks.length?'Vælg det trin, du vil arbejde med.':'Ingen udestående handlinger.', 'muted'),pending);
 function goToTask(task){
  if(task.id==='finance'&&finance){select('actions');finance.open=true;finance.scrollIntoView?.({block:'nearest',behavior:'smooth'});}
  else {select(task.tab);panels.get(task.tab)?.scrollIntoView?.({block:'start',behavior:'smooth'});}
 }
 for(const task of tasks){
  const card=el('div',null,'order-action-item'),button=el('button',task.title,task.error?'action-needs-attention':'');
  button.type='button';button.onclick=()=>goToTask(task);card.append(button);
  if(task.detail){const detail=el('details');detail.append(el('summary','Vis detaljer'),el('p',task.detail));card.append(detail);}
  pending.append(card);
 }
 if(hasUnread(order)){const news=el('div',null,'attention-news'),read=el('button','Markér nyt som læst');read.type='button';news.append(el('span','Nyt siden sidst på denne browser'),read);read.onclick=()=>{markRead(order);news.hidden=true;};hub.append(news);}
 if(finance)hub.append(finance);
 if(completed.length){const done=el('details',null,'completed-steps');done.append(el('summary',`✓ Udført · ${completed.length}`));
  for(const step of completed){const row=el('p',null,'step-complete'),button=el('button','✓ '+step.title);button.type='button';button.onclick=()=>select(step.tab);row.append(button);done.append(row);}hub.append(done);
 }
 const groups=[['summary','Bestilling',[summary]],['proof','Korrektur',[proof]],['documents','Dokumenter',[documents,mailHost?null:resend,supplierDocs,automation].filter(Boolean)],['contact','Kundekontakt',[contact]],['actions','Handlinger',[hub]],['history','Historik',[paymentAttempts,history,events].filter(Boolean)]];
 const prefix='order-'+order.id;
 function select(key,focus=false){if(!panels.has(key))return;selections.set(order.id,key);for(const [k,panel] of panels){panel.hidden=k!==key;const b=buttons.get(k);b.setAttribute('aria-selected',String(k===key));b.tabIndex=k===key?0:-1;}if(focus)buttons.get(key).focus();}
 for(const [key,title,nodes] of groups){const button=el('button',title),panel=el('section',null,'order-tab-panel');const pending=key==='actions'?tasks:[];if(pending.length){button.append(el('span',`${pending.length} handling${pending.length===1?'':'er'}`,'attention-badge'+(pending.some(t=>t.error)?' attention-error':'')));}if(key!=='actions'&&!pending.length&&completed.some(s=>s.tab===key)){button.className='order-tab-complete';button.append(el('span',`✓ ${completed.filter(s=>s.tab===key).length} udført`,'attention-badge step-complete'));}button.type='button';button.id=prefix+'-tab-'+key;button.setAttribute('role','tab');button.setAttribute('aria-controls',prefix+'-panel-'+key);panel.id=prefix+'-panel-'+key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);button.onclick=()=>select(key);panel.append(...nodes);panels.set(key,panel);buttons.set(key,button);tabs.append(button);}
 tabs.onkeydown=e=>{const keys=[...buttons.keys()],i=keys.indexOf([...buttons].find(([,b])=>b===document.activeElement)?.[0]);if(i<0)return;const target=e.key==='Home'?0:e.key==='End'?keys.length-1:e.key==='ArrowRight'?(i+1)%keys.length:e.key==='ArrowLeft'?(i+keys.length-1)%keys.length:null;if(target!==null){e.preventDefault();select(keys[target],true);}};
 workspace.append(tabs,...panels.values());box.append(workspace);
 select(new URLSearchParams(globalThis.location?.hash?.slice(1)||'').get('tab')||selections.get(order.id)||(tasks.length?'actions':'summary'));return {select,panels};
}
