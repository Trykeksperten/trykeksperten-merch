export const mobileSteps=['colour','quantity','method','design','summary'];
export function nextMobileStep(step,{quantityReady=true,blank=false,designReady=false}={}){
 if(step==='colour')return 'quantity';
 if(step==='quantity')return quantityReady?'method':'quantity';
 if(step==='method')return blank?'summary':'design';
 if(step==='design')return designReady?'summary':'design';
 return 'summary';
}
export const nextRotation=angle=>((Number(angle)||0)+225)%360-180;

export function bindMobileProductFlow(root,{groups,selectedColour,quantityReady,blank,designReady,editing=false,doc=document,win=window}){
 const $=id=>root.querySelector('#pf-'+id),media=win.matchMedia('(max-width:1024px)');
 const first=$('variant').closest('.pf-step'),method=$('method').closest('.pf-step');
 first.dataset.mobileProductStep='';method.dataset.mobileMethodStep='';
 const labels={colour:'Farve',quantity:'Antal',method:'Tryk',design:'Design',summary:'Kurv'};
 const wizard=doc.createElement('nav');wizard.className='pf-mobile-progress';wizard.setAttribute('aria-label','Dit produkt trin for trin');
 for(const step of mobileSteps){const button=doc.createElement('button');button.type='button';button.dataset.mobileStep=step;button.textContent=labels[step];wizard.append(button);}
 $('price-summary').after(wizard);
 const swatches=doc.createElement('div');swatches.className='pf-mobile-product-colours';swatches.setAttribute('role','group');swatches.setAttribute('aria-label','Produktfarve');
 const selected=doc.createElement('p');selected.className='pf-mobile-colour-name';selected.setAttribute('aria-live','polite');
 for(const group of groups){const button=doc.createElement('button');button.type='button';button.dataset.productColour=group.key;button.setAttribute('aria-label',group.name);const dot=doc.createElement('span');dot.style.background=/^#[0-9a-f]{3,8}$/i.test(group.hex||'')?group.hex:'#ddd';dot.setAttribute('aria-hidden','true');button.append(dot);swatches.append(button);}
 const colourLabel=$('product-color').closest('label');colourLabel.classList.add('pf-desktop-colour-select');colourLabel.before(swatches,selected);
 const colourNext=doc.createElement('button');colourNext.type='button';colourNext.className='button pf-mobile-colour-next';colourNext.textContent='Fortsæt til antal';first.append(colourNext);
 const quantityNext=doc.createElement('button');quantityNext.type='button';quantityNext.className='button pf-mobile-quantity-next';quantityNext.textContent='Fortsæt til tryk';first.append(quantityNext);
 const error=doc.createElement('p');error.className='error pf-mobile-flow-error';error.setAttribute('role','alert');quantityNext.before(error);
 const designSummary=doc.createElement('button');designSummary.type='button';designSummary.className='button pf-mobile-design-next';designSummary.textContent='Fortsæt til kurv';$('placement-step').append(designSummary);
 const firstTitle=first.querySelector('h2'),originalTitle=firstTitle.textContent;
 let step=editing?'summary':'colour',maxReached=editing?4:0;
 const render=()=>{if(!root.isConnected){dispose();return;}if(media.matches){root.dataset.mobileStep=step;firstTitle.textContent=step==='colour'?'Vælg farve':'Vælg antal';}else{delete root.dataset.mobileStep;firstTitle.textContent=originalTitle;}const key=selectedColour();selected.textContent=groups.find(g=>g.key===key)?.name||'';for(const button of swatches.children)button.setAttribute('aria-pressed',String(button.dataset.productColour===key));for(const button of wizard.children){button.disabled=mobileSteps.indexOf(button.dataset.mobileStep)>maxReached;button.setAttribute('aria-current',button.dataset.mobileStep===step?'step':'false');}designSummary.hidden=!designReady();};
 const go=(next,{scroll=true}={})=>{step=next;maxReached=Math.max(maxReached,mobileSteps.indexOf(step));error.textContent='';render();if(media.matches&&scroll)wizard.scrollIntoView({behavior:win.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});};
 const colourClick=event=>{const button=event.target.closest('[data-product-colour]');if(!button)return;$('product-color').value=button.dataset.productColour;$('product-color').dispatchEvent(new Event('change',{bubbles:true}));maxReached=1;go(nextMobileStep('colour'));};
 const colourContinue=()=>go(nextMobileStep('colour'));
 const quantityContinue=()=>{if(!quantityReady()){error.textContent='Angiv et gyldigt antal, før du fortsætter.';return;}doc.activeElement?.blur?.();go(nextMobileStep('quantity',{quantityReady:quantityReady()}));};
 const methodClick=event=>{if(!media.matches||!event.target.closest('[data-method]')||!quantityReady())return;go(nextMobileStep('method',{blank:blank()}));};
 const checkContinue=()=>{if(media.matches&&designReady())go('summary');else render();};
 const summaryContinue=()=>{if(designReady())go(nextMobileStep('design',{designReady:designReady()}));};
 const navClick=event=>{const button=event.target.closest('[data-mobile-step]');if(!button||button.disabled)return;const next=button.dataset.mobileStep;if(mobileSteps.indexOf(next)>1&&!quantityReady()){go('quantity');error.textContent='Angiv et gyldigt antal, før du fortsætter.';return;}if(next==='summary'&&!blank()&&!designReady()){go('design');return;}go(next);};
 const refresh=()=>render();
 swatches.addEventListener('click',colourClick);colourNext.addEventListener('click',colourContinue);quantityNext.addEventListener('click',quantityContinue);wizard.addEventListener('click',navClick);$('method-cards').addEventListener('click',methodClick);$('check-continue').addEventListener('click',checkContinue);designSummary.addEventListener('click',summaryContinue);root.addEventListener('input',refresh);root.addEventListener('change',refresh);media.addEventListener('change',render);
 const dispose=()=>{swatches.removeEventListener('click',colourClick);colourNext.removeEventListener('click',colourContinue);quantityNext.removeEventListener('click',quantityContinue);wizard.removeEventListener('click',navClick);$('method-cards').removeEventListener('click',methodClick);$('check-continue').removeEventListener('click',checkContinue);designSummary.removeEventListener('click',summaryContinue);root.removeEventListener('input',refresh);root.removeEventListener('change',refresh);media.removeEventListener('change',render);};
 render();return {go,refresh,dispose};
}
