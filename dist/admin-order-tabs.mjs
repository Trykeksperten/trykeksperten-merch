// Presentation only: switching tabs never sends a message or changes an order.
const selections=new Map();
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
export function compactOrderWorkspace(box,{order,products,overview,supplierDocs,documents,contact,automation,history,events,proofNodes=[],actions,decision}){
 const workspace=el('div',null,'order-tab-workspace'),tabs=el('div',null,'order-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Ordreområder');
 const panels=new Map(),buttons=new Map();
 const summary=el('div',null,'order-summary-layout');summary.append(products,overview);
 documents.open=contact.open=true;
 const proof=el('div',null,'order-proof-layout'),visual=el('section',null,'order-proof-visual'),controls=el('section',null,'order-proof-controls');
 const proofHeader=el('div',null,'order-proof-heading'),previewNodes=proofNodes.filter(node=>(node.className||'').split(' ').includes('preview'));if(previewNodes.length){proofHeader.append(...proofNodes.filter(node=>!previewNodes.includes(node)));proof.append(proofHeader);visual.append(...previewNodes);proof.className+=' has-proof-heading';}else visual.append(...proofNodes);if(!proofNodes.length)visual.append(el('p','Ingen korrektur modtaget endnu.','muted'));
 if(decision)controls.append(decision);if(actions){actions.open=true;const primary=actions.querySelector('.order-primary-task');if(primary)actions.insertBefore(primary,actions.children[1]||null);controls.append(actions);}if(!controls.childElementCount)controls.append(el('p','Ingen korrekturhandling afventer.','muted'));proof.append(visual,controls);
 const resend=contact.querySelector('.order-resend'),mailHost=documents.querySelector('.document-mail-review');if(resend&&mailHost)mailHost.append(resend);
 const groups=[['summary','Bestilling',[summary]],['proof','Korrektur',[proof]],['documents','Dokumenter',[documents,mailHost?null:resend,supplierDocs].filter(Boolean)],['contact','Kundekontakt',[contact]],['history','Historik',[automation,history,events].filter(Boolean)]];
 const prefix='order-'+order.id;
 function select(key,focus=false){if(!panels.has(key))return;selections.set(order.id,key);for(const [k,panel] of panels){panel.hidden=k!==key;const b=buttons.get(k);b.setAttribute('aria-selected',String(k===key));b.tabIndex=k===key?0:-1;}if(focus)buttons.get(key).focus();}
 for(const [key,title,nodes] of groups){const button=el('button',title),panel=el('section',null,'order-tab-panel');button.type='button';button.id=prefix+'-tab-'+key;button.setAttribute('role','tab');button.setAttribute('aria-controls',prefix+'-panel-'+key);panel.id=prefix+'-panel-'+key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);button.onclick=()=>select(key);panel.append(...nodes);panels.set(key,panel);buttons.set(key,button);tabs.append(button);}
 tabs.onkeydown=e=>{const keys=[...buttons.keys()],i=keys.indexOf([...buttons].find(([,b])=>b===document.activeElement)?.[0]);if(i<0)return;const target=e.key==='Home'?0:e.key==='End'?keys.length-1:e.key==='ArrowRight'?(i+1)%keys.length:e.key==='ArrowLeft'?(i+keys.length-1)%keys.length:null;if(target!==null){e.preventDefault();select(keys[target],true);}};
 workspace.append(tabs,...panels.values());box.append(workspace);
 select(selections.get(order.id)||'summary');return {select,panels};
}
