import {putCartLines,fetchQuote,readCart,writeCart} from './pf-cart.mjs';
import {setCustomerType} from './customer-pricing.mjs';
const $=id=>document.getElementById(id);
async function api(path,method='GET',body){
 const response=await fetch('/api/company/'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Smerch-Company':'1'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Virksomhedssiden kunne ikke hentes.');return data;
}
function showSession(data){
 $('company-status').hidden=true;$('company-login').hidden=Boolean(data.authenticated);$('company-workspace').hidden=!data.authenticated;
 $('company-name').textContent=data.company?.name||'';
 document.title=data.authenticated?`${data.company.name} | Smerch`:'Virksomhedslogin | Smerch';
}
async function refresh(){try{const session=await api('session');showSession(session);if(session.authenticated){setCustomerType('business');await loadProducts();}}catch{showSession({authenticated:false});$('company-login-error').textContent='Forbindelsen kunne ikke oprettes. Prøv igen.';}}
$('company-login-form').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),values=new FormData(form);button.disabled=true;$('company-login-error').textContent='';
 try{await api('login','POST',{username:values.get('username'),password:values.get('password')});form.reset();await refresh();$('company-name').tabIndex=-1;$('company-name').focus();}catch(error){$('company-login-error').textContent=error.message;}finally{form.elements.password.value='';button.disabled=false;}
});
$('company-logout').addEventListener('click',async()=>{const button=$('company-logout');button.disabled=true;$('company-workspace-error').textContent='';try{await api('logout','POST',{});writeCart(readCart().filter(line=>!line.companyTemplate),{track:false});showSession({authenticated:false});$('company-login-form').elements.username.focus();}catch(error){$('company-workspace-error').textContent=error.message;}finally{button.disabled=false;}});
refresh();

function element(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
async function loadProducts(){
 const items=await api('products'),root=$('company-products');root.replaceChildren();$('company-empty').hidden=items.length>0;
 for(const item of items){const card=element('article');card.className='company-product';const gallery=element('div');gallery.className='company-product-gallery';for(const index of item.previews){const img=element('img');img.src=`/api/company/previews/${item.id}/${index}`;img.alt=`${item.name} – ${item.placements[index]?.position||'fast design'}`;img.loading='lazy';gallery.append(img);}card.append(gallery,element('h2',item.name),element('p',item.placements.map(p=>`${p.position} · ${p.method}`).join(' / ')));const form=element('form'),fieldset=element('fieldset');fieldset.append(element('legend','Vælg antal pr. størrelse'));for(const variant of item.variants){const label=element('label',variant.size),input=element('input');input.name=variant.sku;input.type='number';input.min='0';input.max='100000';input.step='1';input.value='0';input.inputMode='numeric';input.setAttribute('aria-label',`Antal i ${variant.size}`);label.append(input);fieldset.append(label);}const button=element('button','Læg i kurv →');button.className='button';button.type='submit';const error=element('p');error.className='error';error.setAttribute('role','alert');form.append(fieldset,button,error);form.onsubmit=async event=>{event.preventDefault();button.disabled=true;error.textContent='';try{const quantities=Object.fromEntries([...new FormData(form)].map(([sku,q])=>[sku,Number(q)])),result=await api('selection','POST',{id:item.id,revision:item.revision,quantities}),quote=await fetchQuote(result.lines);if(quote.lines.some(line=>line.error||!Number.isFinite(line.totalIncVat)))throw Error(quote.lines.find(line=>line.error)?.error||'Prisen skal afklares. Kontakt os.');putCartLines(result.lines);location.assign('/kurv');}catch(e){error.textContent=e.message;button.disabled=false;}};card.append(form);root.append(card);}
}
