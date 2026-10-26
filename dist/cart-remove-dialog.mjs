export function confirmCartRemoval(trigger){
 return new Promise(resolve=>{
  const prompt=document.createElement('span');prompt.className='cart-remove-confirmation';prompt.setAttribute('role','dialog');prompt.setAttribute('aria-label','Er du sikker?');
  const text=document.createElement('span');text.textContent='Er du sikker?';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Nej';
  const remove=document.createElement('button');remove.type='button';remove.textContent='Ja';
  let done=false;
  function finish(confirmed){if(done)return;done=true;document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);prompt.remove();resolve(confirmed);}
  function outside(event){if(!prompt.contains(event.target)&&!trigger.contains(event.target))finish(false);}
  function escape(event){if(event.key==='Escape'){event.preventDefault();finish(false);}}
  cancel.onclick=()=>finish(false);remove.onclick=()=>finish(true);
  prompt.append(text,cancel,remove);trigger.after(prompt);
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);cancel.focus();
 });
}
