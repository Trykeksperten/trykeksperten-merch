import {renderProofPdf} from './proof-pdf-preview.mjs';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.hash.slice(1)),id=params.get('order'),token=params.get('token');
let current,blobURL,previewReady=false;
// The token stays in the URL fragment: it is not sent in requests, server logs or referrers.
async function api(action='',body){const response=await fetch(`/api/customer-proofs/${encodeURIComponent(id||'')}${action}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token||''}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',referrerPolicy:'no-referrer'});if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error||'Forbindelsen blev afbrudt. Prøv igen.');}return response;}
const labels={approval_pending_pf:'Tak! Din godkendelse er registreret. Smerch afklarer betaling og sender godkendelsen videre til PF.',revision_requested:'Tak! Dit ændringsønske er registreret. Vi vender tilbage med en ny korrektur.',approval_recorded:'PF har bekræftet modtagelsen af godkendelsen.',processing:'Din ordre er under behandling hos produktionspartneren.',shipped:'Din ordre er afsendt.',cancelled:'Ordren er annulleret.'};
function render(){
 $('workspace').hidden=false;$('message').textContent='';$('reference').textContent=current.reference;$('version').textContent=`Version ${current.version}`;$('note').textContent=current.message||'';$('note').hidden=!current.message;
 $('items').replaceChildren();for(const item of current.lines){const p=document.createElement('p');p.textContent=`${item.quantity} × ${item.name} · ${item.sku}`;$('items').append(p);for(const d of item.decorations){const small=document.createElement('p');small.textContent=`${d.position||'Trykplacering'} · ${d.width} × ${d.height} mm · ${d.colors} farve(r)`;$('items').append(small);}}
 $('decision-status').textContent=labels[current.status]||(!current.paymentActive?'Betalingen skal afklares med Smerch, før korrekturen kan godkendes. Du kan stadig bede om ændringer.':'');if(current.decision?.comment)$('decision-status').textContent+='\n\nDin kommentar: '+current.decision.comment;$('decision-form').hidden=current.status!=='proof_received';document.querySelector('[value="approve"]').disabled=!current.paymentActive||!previewReady;
}
async function load(){
 previewReady=false;$('error').textContent='';current=await (await api()).json();render();
 const container=$('preview');container.setAttribute('aria-busy','true');container.textContent='Indlæser korrekturen…';
 try{
  const file=await (await api('/file')).blob();if(blobURL)URL.revokeObjectURL(blobURL);blobURL=URL.createObjectURL(file);$('download').href=blobURL;
  if(current.mimeType==='application/pdf')await renderProofPdf(await file.arrayBuffer(),container);
  else{const media=document.createElement('img');media.src=blobURL;media.alt='Din korrektur';await media.decode();container.replaceChildren(media);}
  previewReady=true;render();
 }catch(error){
  const message=document.createElement('p');message.textContent='Korrekturen kunne ikke vises. Åbn den i fuld størrelse, eller prøv igen.';
  const retry=document.createElement('button');retry.type='button';retry.className='button light';retry.textContent='Prøv igen';retry.onclick=()=>load().catch(showLoadError);
  container.replaceChildren(message,retry);$('error').textContent=error.message;render();
 }finally{container.setAttribute('aria-busy','false');}
}
function showLoadError(error){$('message').textContent=error.message;}
$('decision-form').onchange=()=>{const decision=new FormData($('decision-form')).get('decision');$('approval').hidden=decision!=='approve';$('revision').hidden=decision!=='reject';$('comment').required=decision==='reject';$('comment-hint').textContent=decision==='reject'?'(beskriv dine ændringer)':'(valgfrit)';$('confirmed').required=decision==='approve';$('submit').textContent=decision==='approve'?`Godkend version ${current.version} til produktion`:decision==='reject'?'Send ændringsønske':'Send tilbagemelding';};
$('decision-form').onsubmit=async event=>{event.preventDefault();$('error').textContent='';$('submit').disabled=true;try{const decision=new FormData(event.currentTarget).get('decision');if(decision==='approve'&&!previewReady)throw Error('Korrekturen skal kunne vises, før du kan godkende den.');const files=decision==='reject'?[...$('attachments').files]:[];if(files.length>3||files.some(file=>file.size>5*1024*1024))throw Error('Vælg højst 3 filer på maks. 5 MB hver.');const attachments=await Promise.all(files.map(async file=>({name:file.name,mimeType:file.type,contentBase64:await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);})})));current=await (await api('/decision',{version:current.version,decision,confirmed:$('confirmed').checked,comment:$('comment').value,attachments})).json();render();$('decision-status').scrollIntoView({behavior:'smooth',block:'center'});}catch(error){$('error').textContent=error.message;}finally{$('submit').disabled=false;}};
if(!/^ord-[a-f0-9-]{36}$/.test(id||'')||!/^([a-f0-9]{64})$/.test(token||''))$('message').textContent='Åbn dit personlige link fra korrekturmailen. Kontakt korrektur@smerch.dk, hvis du mangler linket.';else load().catch(error=>{$('message').textContent=error.message;});
