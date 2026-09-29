import {getLanguage,setLanguage,installProductTranslations,translate} from './i18n-core.mjs';
const originals=new WeakMap(),attributes=new WeakMap();
const skip='script,style,noscript,textarea,[translate="no"],[data-no-translate],.pf-design-layer,.pf-designer-text,#pf-designer-text,#pf-art-text,.pf-cart-decorations span,.pf-cart-decorations button,#special-file-list';
let observer,productPromise,applying=false,scheduled=false,selectionVersion=0;
const watches={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label','alt']};
function storedValue(store,key,current){
 const previous=store.get(key);
 const source=previous&&previous.rendered===current?previous.source:current;
 const rendered=translate(source);
 store.set(key,{source,rendered});return rendered;
}
function translateElement(element){
 if(element.closest(skip.replace('textarea,','')))return;
 if(element.tagName==='OPTION'&&!element.hasAttribute('value'))element.setAttribute('value',element.value);
 const state=attributes.get(element)||new Map();attributes.set(element,state);
 for(const key of ['placeholder','title','aria-label','alt',...(element.matches('input[readonly]:not([type=hidden])')?['value']:[])]){
  if(!element.hasAttribute(key))continue;
  const value=element.getAttribute(key),translated=storedValue(state,key,value);
  if(translated!==value)element.setAttribute(key,translated);
 }
}
function apply(){
 if(applying)return;applying=true;observer?.disconnect();
 try{
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
   const node=walker.currentNode;
   if(node.nodeType===1)translateElement(node);
   else if(node.parentElement&&!node.parentElement.closest(skip)){
    const value=node.nodeValue,translated=storedValue(originals,node,value);
    if(value!==translated)node.nodeValue=translated;
   }
  }
  const title=document.querySelector('title');
  if(title){const value=title.textContent,translated=storedValue(originals,title,value);if(translated!==value)title.textContent=translated;}
  document.documentElement.lang=getLanguage();
  document.querySelectorAll('[data-language]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.language===getLanguage()));});
 }finally{applying=false;observer?.observe(document.body,watches);if(observer)observer.observe(document.querySelector('title'),{childList:true,characterData:true,subtree:true});}
}
function queue(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;apply();});}
async function loadProducts(){
 if(!productPromise)productPromise=fetch('/pf-english.json?v=1',{signal:AbortSignal.timeout(15000)}).then(response=>{if(!response.ok)throw Error();return response.json();}).then(installProductTranslations).catch(error=>{productPromise=null;throw error;});
 return productPromise;
}
export async function initLanguage(){
 const languageControls=document.querySelector('#language-switch'),status=document.querySelector('#language-status');
 observer=new MutationObserver(queue);
 async function choose(locale){
  const version=++selectionVersion;
  languageControls?.setAttribute('aria-busy','true');
  try{
   if(locale==='en')await loadProducts();
   if(version!==selectionVersion)return;
   setLanguage(locale);
   try{localStorage.setItem('smerch-language',locale);}catch{}
   if(status)status.textContent='';
   apply();
  }catch{if(version!==selectionVersion)return;if(status)status.textContent='English could not be loaded. Please try again.';apply();}
  finally{if(version===selectionVersion)languageControls?.removeAttribute('aria-busy');}
 }
 languageControls?.addEventListener('click',event=>{const button=event.target.closest('[data-language]');if(button)choose(button.dataset.language);});
 let preferred='da';
 try{preferred=new URLSearchParams(location.search).get('lang')||localStorage.getItem('smerch-language')||'da';}catch{}
 await choose(preferred==='en'?'en':'da');
}
