const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
const fields=['name','company','email','phone','street','postalCode','city','country','deliveryComment'];
export function bindFreightQuote(form,{readCart,goodsTotalIncVat,onChange}){
 const box=el('fieldset'),legend=el('legend','3. Fragt'),note=el('p','Fragten afhænger af varerne og leveringsadressen. Bed om en pris, før du godkender ordren.'),request=el('button','Bed om fragtpris'),status=el('p'),label=el('label'),accept=el('input');
 box.className='checkout-freight';request.type='button';status.setAttribute('role','status');accept.type='checkbox';accept.disabled=true;label.className='legal-check';label.append(accept,el('span','Jeg godkender fragtprisen og den samlede pris vist her.'));box.append(legend,note,request,status,label);
 const legal=form.querySelector('fieldset:last-of-type');form.insertBefore(box,legal);if(legal?.querySelector('legend'))legal.querySelector('legend').textContent='4. Godkend og betal';
 let quote=null,reference=null,context='',sequence=0,timer;const initialCart=JSON.stringify(readCart());
 const shipping=()=>Object.fromEntries(new FormData(form)),key=()=>JSON.stringify([readCart(),...fields.map(field=>form.elements[field]?.value||'')]);
 const valid=()=>fields.filter(f=>['name','email','phone','street','postalCode','city','country'].includes(f)).every(field=>form.elements[field]?.value&&form.elements[field].checkValidity());
 function invalidate(message){sequence++;clearTimeout(timer);quote=null;accept.checked=false;accept.disabled=true;status.textContent=message;onChange({price:null,accepted:false});}
 async function api(action,ref){const response=await fetch('/api/checkout/freight',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,lines:readCart(),shipping:shipping(),deliveryMethod:'STD',goodsTotalIncVat,...ref}),cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error||'Fragtprisen kunne ikke hentes.');return data;}
 function acceptedQuote(){return quote&&accept.checked&&Date.parse(quote.validUntil)>Date.now()&&context===key()&&JSON.stringify(readCart())===initialCart?{id:quote.id,token:reference.token,revision:quote.revision,accepted:true}:null;}
 async function check(){if(JSON.stringify(readCart())!==initialCart){invalidate('Kurven er ændret. Genindlæs betalingssiden og bed om ny fragtpris.');return;}if(!reference||!valid()||!document.contains(form))return;const attempt=++sequence;try{const result=await api('status',reference);if(attempt!==sequence||!document.contains(form))return;
  if(result.status==='quoted'){
   const changed=quote?.revision!==result.revision;quote=result;context=key();accept.disabled=false;if(changed)accept.checked=false;status.textContent='Fragtpris klar. Tilbuddet gælder til '+new Date(result.validUntil).toLocaleString('da-DK',{timeZone:'Europe/Copenhagen'})+'.';request.textContent='Bed om ny fragtpris';onChange({price:result,accepted:!!acceptedQuote()});clearTimeout(timer);timer=setTimeout(check,Math.min(15000,Math.max(100,Date.parse(result.validUntil)-Date.now())));
  }else if(result.status==='review'){quote=null;accept.disabled=true;status.textContent=result.message;onChange({price:null,accepted:false});timer=setTimeout(check,15000);}else{invalidate(result.message||'Fragttilbuddet er allerede brugt.');reference=null;sessionStorage.removeItem('smerch-freight-reference');}
 }catch(error){if(attempt===sequence)invalidate(error.message);}}
 request.onclick=async()=>{if(!valid()){status.textContent='Udfyld først navn, kontaktoplysninger og leveringsadresse.';return;}request.disabled=true;invalidate('Fragtforespørgslen klargøres…');try{reference=await api('request');sessionStorage.setItem('smerch-freight-reference',JSON.stringify({id:reference.id,token:reference.token}));context=key();await check();}catch(error){invalidate(error.message);}finally{request.disabled=false;}};
 accept.onchange=()=>onChange({price:quote,accepted:!!acceptedQuote()});
 form.addEventListener('input',event=>{if(!fields.includes(event.target.name))return;invalidate('Adressen er ændret. Fragt skal bekræftes igen.');if(reference&&valid())timer=setTimeout(check,500);});
 form.addEventListener('change',event=>{if(fields.includes(event.target.name)&&reference&&valid()){clearTimeout(timer);timer=setTimeout(check,100);}});
 const cartChanged=()=>{if(!document.contains(form)){window.removeEventListener('pf-cart-change',cartChanged);window.removeEventListener('storage',cartChanged);return;}if(JSON.stringify(readCart())!==initialCart)invalidate('Kurven er ændret. Genindlæs betalingssiden og bed om ny fragtpris.');};window.addEventListener('pf-cart-change',cartChanged);window.addEventListener('storage',cartChanged);
 try{reference=JSON.parse(sessionStorage.getItem('smerch-freight-reference')||'null');}catch{}if(reference&&valid())check();else onChange({price:null,accepted:false});
 return {acceptedQuote};
}
