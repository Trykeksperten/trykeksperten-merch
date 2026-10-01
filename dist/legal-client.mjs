const en=document.body.dataset.locale==='en',form=document.querySelector('[data-legal-form]');
try{localStorage.setItem('smerch-language',en?'en':'da');}catch{}
if(form)form.addEventListener('submit',async event=>{
 event.preventDefault();if(!form.reportValidity())return;
 const kind=form.dataset.legalForm,button=form.querySelector('button'),status=form.querySelector('[role=status]'),data=Object.fromEntries(new FormData(form));
 for(const key of ['email','sms','ownDetails','confirmed'])if(form.elements[key]?.type==='checkbox')data[key]=form.elements[key].checked;
 data.locale=en?'en':'da';data.version=document.body.dataset.consentVersion;
 if(kind==='subscribe'&&(!data.email&&!data.sms)){status.textContent=en?'Select email or SMS.':'Vælg e-mail eller SMS.';return;}
 button.disabled=true;status.classList.remove('error');status.textContent=en?'Saving…':'Gemmer…';
 try{
  const response=await fetch(kind==='withdrawal'?'/api/legal/withdrawal':`/api/marketing/${kind}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();if(!response.ok)throw Error(result.error||(en?'Please try again.':'Prøv igen.'));
  if(kind==='withdrawal'){
   status.textContent=en?'Your withdrawal notice has been received. Save your receipt below.':'Din fortrydelsesmeddelelse er modtaget. Gem kvitteringen nedenfor.';
   const container=document.querySelector('#receipt');container.replaceChildren();const title=document.createElement('h2');title.textContent=en?'Receipt':'Kvittering';const pre=document.createElement('pre');pre.textContent=result.receipt;
   const link=document.createElement('a'),url=URL.createObjectURL(new Blob([result.receipt],{type:'text/plain;charset=utf-8'}));link.href=url;link.download=`smerch-${result.id}.txt`;link.className='receipt-download';link.textContent=en?'Save receipt':'Gem kvittering';container.append(title,pre,link);link.click();
   const note=document.createElement('p');note.textContent=result.emailSent?(en?'A copy was sent by email.':'En kopi er sendt på e-mail.'):(en?'The email copy is queued. Keep the downloaded receipt.':'E-mailkopien er sat i kø. Gem den downloadede kvittering.');container.append(note);
   button.hidden=true;
  }else{status.textContent=kind==='subscribe'?(en?'Your choices have been saved. You can unsubscribe at any time.':'Dine valg er gemt. Du kan altid afmelde dig.'):(en?'Any matching marketing subscriptions have been cancelled.':'Eventuelle marketingtilmeldinger til de angivne oplysninger er afmeldt.');form.reset();}
 }catch(error){status.classList.add('error');status.textContent=error.message;}finally{button.disabled=false;}
});
