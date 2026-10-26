export function hsvToHex(h,s,v){
 const f=n=>{const k=(n+h/60)%6;return Math.round(255*(v-v*s*Math.max(0,Math.min(k,4-k,1)))).toString(16).padStart(2,'0');};
 return '#'+f(5)+f(3)+f(1);
}
export function hexToHsv(hex){
 const [r,g,b]=hex.slice(1).match(/../g).map(c=>parseInt(c,16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
 let h=0;if(d)h=60*(max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4);
 return [h,max?d/max:0,max];
}
// The browser's native colour popup cannot contain our confirmation button.
export function bindConfirmedColourPicker(input,root,{preview=()=>{}}={}){
 const dialog=document.createElement('section');dialog.className='pf-colour-picker';dialog.setAttribute('aria-label','Vælg tekstfarve');dialog.hidden=true;input.setAttribute('aria-expanded','false');
 dialog.innerHTML='<div class="pf-colour-picker-body"><header><strong>Vælg farve</strong><button type="button" data-cancel aria-label="Annuller farvevalg">×</button></header><div class="pf-colour-field" aria-hidden="true"><i></i></div><label>Farvetone<input data-hue type="range" min="0" max="359" step="1"></label><div class="pf-colour-rgb"><label>R<input data-channel="0" type="number" min="0" max="255" required></label><label>G<input data-channel="1" type="number" min="0" max="255" required></label><label>B<input data-channel="2" type="number" min="0" max="255" required></label></div><footer><span class="pf-colour-swatch" aria-label="Valgt farve"></span><button type="button" class="pf-colour-confirm" aria-label="Bekræft farve">✓</button></footer></div>';
 input.closest('label').after(dialog);const field=dialog.querySelector('.pf-colour-field'),marker=field.querySelector('i'),hue=dialog.querySelector('[data-hue]'),channels=[...dialog.querySelectorAll('[data-channel]')],swatch=dialog.querySelector('.pf-colour-swatch');let h=0,s=0,v=0,draft=input.value,original=input.value;
 const paint=()=>{draft=hsvToHex(h,s,v);field.style.backgroundColor=hsvToHex(h,1,1);marker.style.left=`${s*100}%`;marker.style.top=`${(1-v)*100}%`;hue.value=Math.round(h);swatch.style.backgroundColor=draft;channels.forEach((el,i)=>el.value=parseInt(draft.slice(1+i*2,3+i*2),16));preview(draft);};
 const close=(cancel=false)=>{if(cancel)preview(original);dialog.hidden=true;input.setAttribute('aria-expanded','false');input.focus({preventScroll:true});};
 input.addEventListener('click',event=>{event.preventDefault();if(!dialog.hidden){close(true);return;}original=input.value;[h,s,v]=hexToHsv(input.value);paint();dialog.hidden=false;input.setAttribute('aria-expanded','true');});
 hue.oninput=()=>{h=Number(hue.value);paint();};
 for(const channel of channels)channel.oninput=()=>{if(channels.some(c=>!c.checkValidity()||c.value===''))return;[h,s,v]=hexToHsv('#'+channels.map(c=>Number(c.value).toString(16).padStart(2,'0')).join(''));paint();};
 const move=event=>{const r=field.getBoundingClientRect();s=Math.max(0,Math.min(1,(event.clientX-r.left)/r.width));v=1-Math.max(0,Math.min(1,(event.clientY-r.top)/r.height));paint();};
 field.onpointerdown=event=>{if(event.button!==0)return;field.setPointerCapture(event.pointerId);move(event);};field.onpointermove=event=>{if(field.hasPointerCapture(event.pointerId))move(event);};field.onpointerup=event=>{if(field.hasPointerCapture(event.pointerId))field.releasePointerCapture(event.pointerId);};
 dialog.querySelector('[data-cancel]').onclick=()=>close(true);
 dialog.querySelector('.pf-colour-confirm').onclick=event=>{event.preventDefault();if(channels.some(c=>!c.checkValidity()||c.value===''))return;input.value=draft;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));close();};
 dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close(true);}if(event.key==='Enter'){event.preventDefault();dialog.querySelector('.pf-colour-confirm').click();}});
}
