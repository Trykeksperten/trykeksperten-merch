import {translate} from './i18n-core.mjs';
import {shopProducts,pricedVariants} from './pf-visibility.mjs';
const normalize=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('da').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function matchesProductSearch(product,query){
 const text=normalize(`${product.name||''} ${translate(product.name||'')} ${product.brand||''} ${product.modelCode||''}`);
 return normalize(query).split(/\s+/).filter(Boolean).every(word=>text.includes(word));
}
export function searchSuggestions(catalog,prices,query){
 if(normalize(query).length<2)return [];
 return shopProducts(catalog,prices).filter(p=>matchesProductSearch(p,query)).slice(0,5);
}
export function bindProductSearch({form,input,getCatalog,getPrices,navigate}){
 const panel=document.createElement('div');panel.className='search-suggestions';panel.id='search-suggestions';panel.hidden=true;form.append(panel);
 input.setAttribute('aria-controls',panel.id);input.setAttribute('aria-expanded','false');
 const close=()=>{panel.hidden=true;input.setAttribute('aria-expanded','false');};
 const update=()=>{
  const query=input.value.trim();panel.replaceChildren();
  if(normalize(query).length<2){close();return;}
  const products=searchSuggestions(getCatalog(),getPrices(),query);
  for(const product of products){
   const link=document.createElement('a');link.href='/design/'+encodeURIComponent(product.id);
   const source=pricedVariants(product,getPrices())[0]?.images?.[0];
   if(source){const image=document.createElement('img');image.src=source;image.alt='';image.width=48;image.height=48;link.append(image);}
   const label=document.createElement('span');label.textContent=translate(product.name);link.append(label);panel.append(link);
  }
  if(!products.length){const empty=document.createElement('p');empty.textContent=translate('Ingen produkter fundet');panel.append(empty);}
  const all=document.createElement('a');all.className='search-all';all.href='/produkter?q='+encodeURIComponent(query);all.textContent=translate('Se alle søgeresultater')+' →';panel.append(all);
  panel.hidden=false;input.setAttribute('aria-expanded','true');
 };
 input.addEventListener('input',update);input.addEventListener('focus',update);
 form.addEventListener('focusout',e=>{if(!form.contains(e.relatedTarget))close();});
 document.addEventListener('click',e=>{if(!form.contains(e.target))close();});
 form.addEventListener('keydown',e=>{
  if(e.key==='Escape'){close();input.focus();close();return;}
  if(!['ArrowDown','ArrowUp'].includes(e.key))return;
  e.preventDefault();if(panel.hidden)update();const links=[...panel.querySelectorAll('a')];if(!links.length)return;
  const index=links.indexOf(document.activeElement);links[index<0?(e.key==='ArrowDown'?0:links.length-1):(index+(e.key==='ArrowDown'?1:-1)+links.length)%links.length].focus();
 });
 // Keep focus in the search field until the link click is dispatched. Mobile
 // browsers can blur with relatedTarget=null before click and hide the target.
 panel.addEventListener('pointerdown',e=>{
  if(e.isPrimary!==false&&e.button===0&&e.target.closest('a'))e.preventDefault();
 });
 panel.addEventListener('click',e=>{const link=e.target.closest('a');if(!link)return;e.preventDefault();e.stopPropagation();close();navigate(link.getAttribute('href'));});
 form.addEventListener('submit',close);
 window.addEventListener('popstate',close);
 return close;
}
