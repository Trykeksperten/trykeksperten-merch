const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
export function eproofApiPanel(order,{api,refresh,say}){
 if(!order.proof?.api||!order.decision||!['approval_pending_pf','revision_requested'].includes(order.status))return null;
 const section=el('section');section.className='order-primary-task';const approved=order.decision.decision==='approve',dispatch=order.decision.apiDispatch;
 section.append(el('h2',approved?'Send godkendelse til PF':'Send ændringsønske til PF'));
 for(const c of order.proof.api.configurations)section.append(el('p',`${c.reference} · ${c.description}`));
 if(dispatch){section.append(el('p',dispatch.state==='delivered'?'Beslutningen er sendt via PF API. PF’s endelige bekræftelse af godkendelsen registreres særskilt.':'Afsendelsen afventer afstemning med PF. Der sendes ikke igen, da PF kan have modtaget svaret.'));return section;}
 const artwork=[];
 if(!approved){section.append(el('p',order.decision.comment));const files=el('div'),add=el('button','Tilføj nyt artwork');add.type='button';add.onclick=()=>{const row=el('div'),fields={};for(const [name,label] of [['artUrl','Offentligt HTTPS-link til trykfil'],['color','Farve / Full Color'],['height','Højde i mm'],['width','Bredde i mm']]){const wrapper=el('label',label),input=el('input');input.setAttribute('aria-label',label);if(name==='artUrl')input.type='url';fields[name]=input;wrapper.append(input);row.append(wrapper);}const remove=el('button','Fjern artwork');remove.type='button';const entry={row,fields};artwork.push(entry);remove.onclick=()=>{artwork.splice(artwork.indexOf(entry),1);row.remove();};row.append(remove);files.append(row);};section.append(files,add);if(order.decision.attachments?.length)section.append(el('p','Kundens bilag skal gennemgås og klargøres som offentlige artwork-links til PF.'));
 }
 const checkbox=el('input');checkbox.type='checkbox';const label=el('label','Jeg har gennemgået korrekturen og kundens svar og godkender, at dette svar sendes til PF.');label.prepend(checkbox);
 const send=el('button',approved?'Godkend og send til PF':'Godkend ændringsønske og send til PF');send.className='primary';send.disabled=true;checkbox.onchange=()=>{send.disabled=!checkbox.checked;};
 send.onclick=async()=>{send.disabled=true;try{await api(`/api/pf-orders/${order.id}/eproof-send`,'POST',{version:order.proof.version,confirmed:checkbox.checked,newArt:artwork.map(({fields})=>Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value.trim()])))});await refresh();say('Svaret er sendt til PF. Ingen betaling er hævet.');}catch(error){await refresh();say(error.message);}};
 section.append(label,send,el('p','Kundens svar afsendes først, når en medarbejder godkender her.'));return section;
}
