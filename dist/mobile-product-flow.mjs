export const nextRotation=angle=>((Number(angle)||0)+225)%360-180;

// Product choices stay together. Only continuing from a completed design moves down to the basket.
export function bindMobileProductFlow(root,{groups,selectedColour,designReady,doc=document,win=window}){
 const $=id=>root.querySelector('#pf-'+id),media=win.matchMedia('(max-width:1024px)');
 const first=$('variant').closest('.pf-step'),firstTitle=first.querySelector('h2'),originalTitle=firstTitle.textContent;
 const swatches=doc.createElement('div');swatches.className='pf-mobile-product-colours';swatches.setAttribute('role','group');swatches.setAttribute('aria-label','Produktfarve');
 const selected=doc.createElement('p');selected.className='pf-mobile-colour-name';selected.setAttribute('aria-live','polite');
 for(const group of groups){const button=doc.createElement('button');button.type='button';button.dataset.productColour=group.key;button.setAttribute('aria-label',group.name);const dot=doc.createElement('span');dot.style.background=/^#[0-9a-f]{3,8}$/i.test(group.hex||'')?group.hex:'#ddd';dot.setAttribute('aria-hidden','true');button.append(dot);swatches.append(button);}
 const colourLabel=$('product-color').closest('label');colourLabel.classList.add('pf-desktop-colour-select');colourLabel.before(swatches,selected);
 const designSummary=doc.createElement('button');designSummary.type='button';designSummary.className='button pf-mobile-design-next';designSummary.textContent='Fortsæt til kurv';$('placement-step').append(designSummary);
 const render=()=>{if(!root.isConnected){dispose();return;}if(media.matches){root.dataset.mobileLayout='stacked';firstTitle.textContent='1. Farve og antal';}else{delete root.dataset.mobileLayout;firstTitle.textContent=originalTitle;}const key=selectedColour();selected.textContent='Farve · '+(groups.find(group=>group.key===key)?.name||'');for(const button of swatches.children)button.setAttribute('aria-pressed',String(button.dataset.productColour===key));designSummary.hidden=!designReady();};
 const colourClick=event=>{const button=event.target.closest('[data-product-colour]');if(!button||selectedColour()===button.dataset.productColour)return;$('product-color').value=button.dataset.productColour;$('product-color').dispatchEvent(new Event('change',{bubbles:true}));render();};
 const continueToBasket=()=>{if(designReady())$('add-cart').closest('.pf-buy-box').scrollIntoView({behavior:win.matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});render();};
 swatches.addEventListener('click',colourClick);$('check-continue').addEventListener('click',continueToBasket);designSummary.addEventListener('click',continueToBasket);root.addEventListener('input',render);root.addEventListener('change',render);media.addEventListener('change',render);
 const dispose=()=>{swatches.removeEventListener('click',colourClick);$('check-continue').removeEventListener('click',continueToBasket);designSummary.removeEventListener('click',continueToBasket);root.removeEventListener('input',render);root.removeEventListener('change',render);media.removeEventListener('change',render);};
 render();return {refresh:render,dispose};
}
