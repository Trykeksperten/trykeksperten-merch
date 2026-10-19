// Show an alternative before the customer spends time filling an unavailable form.
export async function bindContactAvailability(form){
 if(!form)return;
 try{
  const response=await fetch('/api/contact/status');
  if(!response.ok)return;
  const status=await response.json();
  if(status.ready!==false||!form.isConnected)return;
  const notice=document.createElement('p');notice.className='notice';notice.setAttribute('role','status');
  const message=document.createElement('span');message.textContent='Formularen er midlertidigt utilgængelig. Skriv direkte til ';
  const link=document.createElement('a');link.href='mailto:hello@smerch.dk';link.textContent='hello@smerch.dk';
  notice.append(message,link);form.prepend(notice);
  const button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;
 }catch{/* The submit handler still reports transient network errors. */}
}
