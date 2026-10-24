import {actorLabel,mailActivity,proofActionLabel} from './admin-activity.mjs';
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
const labels={review:'Afventer din gennemgang',blocked:'Mangler oplysninger',sent:'Sendt',failed:'Kunne ikke starte afsendelse',uncertain:'Levering ukendt · kræver afstemning',sending:'Afsendelse behandles',pending:'Afventer afsendelse',complete:'Afsluttet',obsolete:'Tidligere version / link'};
export async function automationPanel(container,api){
 container.append(el('h2','Automatik og beskeder'),el('p','Dokumentgenerering gemmer en PDF. Afsendelse sender en besked. Kundens korrekturgodkendelse frigiver hverken produktion hos PF eller hæver penge.'));
 try{const data=await(await api('/api/pf-orders/automation-settings')).json(),form=el('form'),settings=data.settings;
 function select(key,title,options){const label=el('label',title),input=el('select');for(const [value,text] of options){const option=el('option',text);option.value=value;option.selected=settings[key]===value;input.append(option);}input.dataset.setting=key;input.onchange=()=>settings[key]=input.value;label.append(input);form.append(label);}
 select('confirmationMail','Ordrebekræftelse efter betalingsreservation',[['automatic','Send automatisk'],['review','Gennemse og send på ordren']]);
 select('decisionReceipt','Kvittering til kunden for korrektursvar',[['automatic','Send automatisk'],['review','Send efter min gennemgang']]);
 select('staffDecisionMail','Besked til korrektur@smerch.dk om kundens svar',[['automatic','Send automatisk'],['review','Send efter min gennemgang']]);
 select('shipmentMail','Forsendelsesmail fra Smerch',[['review','Gennemse og send på ordren'],['automatic','Send automatisk med gyldigt trackinglink']]);
 select('supplierCustomerMail','PF’s direkte kundemails · skal bekræftes hos PF',[['unknown','Ikke afklaret'],['disabled','Bekræftet deaktiveret hos PF'],['enabled','PF sender selv beskeder']]);
 select('proofPublication','Ny korrektur modtaget via sikret indbakke',[['review','Gennemse og send til kunden'],['automatic','Opret kundelink og send automatisk']]);
 const mailboxLabel=el('label'),mailboxEnabled=el('input');mailboxEnabled.type='checkbox';mailboxEnabled.checked=settings.proofMailboxEnabled===true;mailboxEnabled.onchange=()=>settings.proofMailboxEnabled=mailboxEnabled.checked;mailboxLabel.append(mailboxEnabled,document.createTextNode('Modtag nye PF-korrekturer fra korrektur@smerch.dk · læseadgang'));form.append(mailboxLabel);
 const mailboxState=el('p',data.mailbox?.error||data.mailbox?.enabled&&data.mailbox?.connected?'Postkassen er tilsluttet. Nye korrekturer hentes uden at ændre mails i indbakken.':'Postkassen er ikke aktiv.');if(data.mailbox?.error)mailboxState.textContent=data.mailbox.error;form.append(mailboxState);const connect=el('button','Tilslut postkasse · gennemgang før afsendelse');connect.type='button';connect.onclick=async()=>{connect.disabled=true;try{await api('/api/pf-orders/proof-mailbox/connect','POST',{});settings.proofMailboxEnabled=true;settings.proofPublication='review';form.querySelector('[data-setting=proofPublication]').value='review';mailboxEnabled.checked=true;mailboxState.textContent='Tilsluttet med læseadgang. Eksisterende mails springes over; nye korrekturer kræver din gennemgang. Gem siden igen før du ændrer afsendelsesregler.';}catch(e){mailboxState.textContent=e.message;}finally{connect.disabled=false;}};form.append(connect);
 const label=el('label'),reminders=el('input');reminders.type='checkbox';reminders.checked=settings.proofReminders;reminders.onchange=()=>settings.proofReminders=reminders.checked;label.append(reminders,document.createTextNode('Påmind efter 48 timer · højst to påmindelser pr. aktivt kundelink'));form.append(label);
 form.append(el('p','PF-korrekturer hentes fra den tilsluttede postkasse eller et sikret relæ. Ukendte mailformater og usikre referencer kræver gennemgang. Forsendelsesautomatik behandler også eksisterende klargjorte beskeder. Ukendt SMTP-levering genforsøges aldrig automatisk.'));
 const save=el('button','Gem automatik'),status=el('p');status.setAttribute('role','status');form.append(save,status);form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await api('/api/pf-orders/automation-settings','POST',settings);status.textContent='Indstillinger gemt.';}catch(error){status.textContent=error.message;}finally{save.disabled=false;}};container.append(form,el('h3','Korrekturimport'));
 for(const row of [...data.intake||[],...(data.mailbox?.items||[]).filter(item=>item.status==='blocked').map(item=>({...item,mailbox:true}))]){if(!['blocked','review','processing'].includes(row.status)&&!row.conflict||row.status==='reviewed')continue;const p=el('p','Korrekturimport · '+(row.error||'Gennemgå korrekturen og send den til kunden.'));if(row.orderId){const a=el('a',' Åbn ordre');a.href='/admin/pf-orders#order='+row.orderId;p.append(a);}else p.append(document.createTextNode(' · Ingen sikker ordretilknytning. Find originalmailen i korrektur@smerch.dk.'));const done=el('button','Markér manuelt behandlet');done.type='button';done.onclick=async()=>{const note=prompt('Beskriv den manuelle behandling. Dette sender ingen mail og tilknytter ikke automatisk en ordre.');if(!note?.trim())return;done.disabled=true;try{await api('/api/pf-orders/'+(row.mailbox?'proof-mailbox/':'proof-intake/')+row.key+'/review','POST',{note});p.remove();}catch(e){p.append(el('span',e.message));done.disabled=false;}};p.append(done);container.append(p);}
 container.append(el('h3','Forsendelsesbeskeder'));
 for(const row of data.shipments||[]){const p=el('p'),link=el('a',(labels[row.status]||row.status)+' · '+(row.to||'Modtager mangler'));link.href='/admin/pf-orders#order='+row.orderId;p.append(link);container.append(p);}if(!data.shipments?.length)container.append(el('p','Ingen forsendelsesbeskeder endnu.'));
 }catch(error){container.append(el('p',error.message));}
}
const shortStates={review:'Til gennemgang',blocked:'Kræver handling',sent:'Sendt',failed:'Afsendelse fejlet',uncertain:'Levering ukendt',sending:'Afsendes',pending:'Afventer afsendelse',complete:'Afsluttet',obsolete:'Tidligere link'};
function briefTitle(row){
 if(row.confirmation)return 'Ordrebekræftelse';
 if(!row.proof)return 'Forsendelsesmail';
 return ({invitation:'Korrektur til godkendelse',receipt:'Kvittering for korrektursvar',staff_decision:'Internt korrektursvar'}[row.kind]||'Korrekturbesked')+' · v'+row.version;
}
function timestamp(value,seconds=false){return value?new Date(value).toLocaleString('da-DK',{timeZone:'Europe/Copenhagen',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',...(seconds?{second:'2-digit'}:{})}):'Ikke sendt';}
export function orderAutomationPanel(order,api){
 const box=el('details');box.className='order-mail-history';box.append(el('summary','Beskeder og afsendelser'));
 const content=el('div');box.append(content);const url=`/api/pf-orders/${order.id}/automation`;
 async function load(){
  content.replaceChildren();
  try{
   const data=await(await api(url)).json();
   for(const item of data.intake||[])if(['blocked','review','processing'].includes(item.status)||item.conflict&&item.status!=='reviewed')content.append(el('p','Korrekturimport: '+(item.error||'Afventer gennemgang og afsendelse.')));
   const rows=[...data.shipments,...data.proofs.map(p=>({...p,proof:true})),...(data.confirmation?[{...data.confirmation,confirmation:true}]:[])];
   if(!rows.length){content.append(el('p','Ingen beskeder i køen endnu.'));return;}
   const header=el('div');header.className='mail-history-head';header.setAttribute('aria-hidden','true');for(const label of ['','Tidspunkt','Handling','Udført af','Modtager','Status'])header.append(el('span',label));content.append(header);
   for(const row of rows){
    const card=el('details'),summary=el('summary'),body=el('div');card.className='mail-history-row';body.className='mail-history-detail';
    const arrow=el('span','›');arrow.className='mail-history-chevron';arrow.setAttribute('aria-hidden','true');summary.append(arrow);
    const at=row.sentAt||row.lastSentAt;summary.setAttribute('aria-label',[timestamp(at),briefTitle(row),'Udført af: '+actorLabel(row.initiatedBy),'Modtager: '+(row.to||'Ikke registreret'),'Status: '+(labels[row.status]||row.status)].join(' · '));
    for(const [cls,text,title] of [
     ['time',timestamp(at),at?'Sendt: '+timestamp(at,true):'Afsendelse er ikke registreret'],
     ['action',briefTitle(row),row.confirmation?'Ordrebekræftelse':row.proof?proofActionLabel(row.kind)+' · version '+row.version:'Forsendelsesmail'],
     ['actor',actorLabel(row.initiatedBy),'Igangsat af: '+actorLabel(row.initiatedBy)],
     ['to',row.to||'Ikke registreret','Modtager: '+(row.to||'Ikke registreret')],
     ['status',shortStates[row.status]||row.status,labels[row.status]||row.status]
    ]){const cell=el('span',text);cell.className='mail-history-'+cls;cell.title=title;summary.append(cell);}
    if(['blocked','failed','uncertain'].includes(row.status))card.className+=' needs-attention';
    body.append(el('h4',row.confirmation?'Ordrebekræftelse':row.proof?proofActionLabel(row.kind)+' · version '+row.version:'Forsendelsesmail'));
    for(const line of mailActivity(row))body.append(el('p',line));
    body.append(el('p','Status: '+(labels[row.status]||row.status)),el('p',at?'Sendt: '+timestamp(at,true):'Ingen afsendelse registreret.'));
    if(row.text)body.append(el('pre',row.text));
    for(const problem of row.problems||[])body.append(el('p',problem));if(row.error)body.append(el('p',row.error));
    if((!row.proof&&['review','failed','uncertain'].includes(row.status))||((row.proof||row.confirmation)&&['uncertain','pending'].includes(row.status))){
     const button=el('button',row.status==='uncertain'?'Genforsøg efter afstemning':row.status==='failed'?'Prøv igen':row.proof||row.confirmation?'Send besked':'Send forsendelsesmail');button.type='button';
     button.onclick=async()=>{const uncertain=row.status==='uncertain';if(uncertain&&!confirm('Har du kontrolleret mailkontoen og bekræftet, at denne besked IKKE blev sendt? Et nyt forsøg kan ellers sende en dublet.'))return;button.disabled=true;try{await api(url,'POST',{id:row.id,kind:row.confirmation?'confirmation':row.proof?'proof':'shipment',key:row.key,confirmUncertain:uncertain});await load();}catch(e){body.append(el('p',e.message));button.disabled=false;}};
     body.append(button);
    }
    card.append(summary,body);content.append(card);
   }
  }catch(e){content.append(el('p',e.message));}
 }
 load();return box;
}
