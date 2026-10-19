const key='smerch-customer-type';
let choice;
try{choice=globalThis.localStorage?.getItem(key);}catch{}
export const customerType=()=>choice==='business'?'business':'consumer';
export const vatLabel=()=>customerType()==='business'?'ekskl. moms':'inkl. moms';
export const fromInc=(gross,net)=>customerType()==='business'?(Number.isFinite(net)?net:Math.round(gross/1.25)):gross;
export const fromEx=net=>customerType()==='business'?net:net+Math.round(net*.25);
export const quoteAmount=q=>fromInc(q.totalIncVat,q.net);
export function setCustomerType(value){
 if(!['consumer','business'].includes(value))return;
 choice=value;try{localStorage.setItem(key,value);}catch{}
 globalThis.dispatchEvent?.(new Event('customer-pricing-change'));
}
export function initCustomerPricing(){
 const button=document.querySelector('#customer-pricing-toggle');
 const dialog=document.createElement('dialog');dialog.className='customer-choice';dialog.setAttribute('aria-labelledby','customer-choice-title');
 dialog.innerHTML='<button type="button" class="customer-choice-close" aria-label="Luk">×</button><p class="eyebrow">VELKOMMEN TIL SMERCH</p><h2 id="customer-choice-title">Handler du privat eller erhverv?</h2><p>Merchandise til private og professionelle.</p><div class="customer-choice-options"><button type="button" data-customer="consumer"><strong>Privat</strong><span>Priser inkl. moms</span></button><button type="button" data-customer="business"><strong>Erhverv</strong><span>Priser ekskl. moms</span></button></div><p class="small muted">Du kan altid ændre dit valg øverst på siden.</p>';
 document.body.append(dialog);
 const update=()=>{const footer=document.querySelector('#footer-vat-label');if(footer)footer.textContent='Alle priser er '+vatLabel();button.textContent=customerType()==='business'?'Erhverv · ekskl. moms':'Privat · inkl. moms';};
 button.onclick=()=>dialog.showModal();
 dialog.querySelectorAll('[data-customer]').forEach(node=>node.onclick=()=>{setCustomerType(node.dataset.customer);dialog.close();});
 dialog.querySelector('.customer-choice-close').onclick=()=>{if(!choice)setCustomerType('consumer');dialog.close();};
 dialog.addEventListener('cancel',()=>{if(!choice)setCustomerType('consumer');});
 window.addEventListener('customer-pricing-change',update);
 window.addEventListener('storage',event=>{if(event.key===key){choice=event.newValue;window.dispatchEvent(new Event('customer-pricing-change'));}});
 update();if(!['consumer','business'].includes(choice))dialog.showModal();
}
