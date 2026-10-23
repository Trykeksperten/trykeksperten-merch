// Keep validation and progress next to the action, even when the order list is long.
export function bindTestSubmission({$,cartTest,api,refresh,show,labels}){
 const form=$('gateway-test-form'),button=$('send-gateway-test'),feedback=$('test-feedback');let busy=false;
 const report=(message,error=false)=>{feedback.textContent=message;feedback.className=error?'test-error':'test-progress';if(error)feedback.focus();const login=$('test-login-link');if(login)login.hidden=!/Administratoradgang|Medarbejderlogin|login er udløbet/.test(message);};
 form.addEventListener('invalid',()=>report('Udfyld de markerede felter, før du sender testordren.',true),true);
 form.onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  if($('test-confirmation').value.trim()!=='TEST'){report('Skriv kun TEST i bekræftelsesfeltet — ikke TEST TEST TEST.',true);$('test-confirmation').focus();return;}
  busy=true;button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Klargør logo og mockup …';report('Klargør testordren. Vent, mens logo og mockup bliver gjort klar.');
  try{
   const session=await(await api('/api/admin/session')).json();if(!session.authenticated)throw Error('Dit login er udløbet. Åbn login nedenfor i en ny fane, log ind, og kom tilbage og tryk Send testordre til PF igen. Dine testfelter er bevaret.');
   const shipping=Object.fromEntries([['name','name'],['email','email'],['phone','phone'],['street','street'],['postalCode','postal'],['city','city']].map(([key,id])=>[key,$('test-'+id).value.trim()]));
   const isCart=$('test-source').value==='cart',body=isCart?await cartTest.payload(shipping):{...shipping,confirmation:'TEST'};
   button.textContent='Sender til PF …';report('Sender testordren til PF’s testmiljø …');
   const result=await(await api(isCart?'/api/pf-orders/test-cart':'/api/pf-orders/test','POST',body)).json();
   $('test-confirmation').value='';
   const message=result.status==='gateway_accepted'?`Testordren ${result.purchaseOrderNumber} er modtaget af PF’s test-Gateway. Ingen betaling er oprettet.`:`Testordren ${result.purchaseOrderNumber} har status ${labels[result.status]||result.status}. Den er ikke sendt igen. Afstem med PF ved tvivl.`;
   report(message);
   try{await refresh();await show(result.id);}catch{report(message+' Ordrevisningen kunne ikke opdateres. Opdatér siden for at se ordren.');}
  }catch(error){report(error.message||'Testordren kunne ikke sendes. Prøv at indlæse kurven igen.',true);}
  finally{busy=false;button.disabled=false;button.removeAttribute('aria-busy');button.textContent='Send testordre til PF';}
 };
}
