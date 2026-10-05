import {pricedVariants} from './pf-visibility.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
// Supplier lifestyle photographs, verified against the full product records.
const stories={
 'pf-100834':{image:'https://images.pfconcept.com/ProductImages_All/JPG/500x500/10083410_M1.jpg',title:'Med på hele dagen.',label:'Stanley Quencher',crop:'portrait'},
 'pf-107790':{image:'https://images.pfconcept.com/ProductImages_All/JPG/500x500/10779002_M1.jpg',title:'Plads til store idéer.',label:'Karst · Notesbøger',crop:'landscape'}
};
export function editorialStory(products,id){
 const product=products.find(product=>product.id===id),story=stories[id];
 if(!product||!story)return '';
 return `<a class="product-story product-story--${story.crop}" href="/design/${escape(id)}"><img src="${story.image}" alt="${escape(story.label)} i hverdagen" loading="lazy" decoding="async" width="500" height="500"><div class="product-story-copy"><span>${story.label}</span><h3>${story.title}</h3><span class="product-story-link">Se produktet ↗</span></div></a>`;
}
// Sizes share a colour; show each supplier colour only once.
export function productColorSwatches(variants=[],selectedImage=''){
 const colors=new Map();
 for(const variant of variants){
  const name=String(variant.color||variant.colorCode||'').trim();
  const hex=/^#[a-f0-9]{6}$/i.test(variant.hex||'')?variant.hex.toLowerCase():'';
  const key=String(variant.colorCode||name||hex).toLowerCase();
  const image=variant.images?.[0];
  if(key&&image&&(!colors.has(key)||variant.images.includes(selectedImage)))colors.set(key,{name:name||'Farve',hex,image});
 }
 if(colors.size<2)return '';
 return `<span class="editorial-swatches" role="group" aria-label="Vælg produktfarve">${[...colors.values()].map(({name,hex,image})=>`<button type="button" class="editorial-swatch${hex?'':' swatch-unknown'}" aria-label="Vis ${escape(name)}" aria-pressed="${image===selectedImage}" title="${escape(name)}" data-card-image="${escape(image)}" data-card-color="${escape(name)}"${hex?` style="--swatch:${hex}"`:''}></button>`).join('')}</span>`;
}
export function bindProductColorSwatches(root){
 for(const card of root.querySelectorAll('.product-card')){
  const image=card.querySelector('.product-image img');
  const swatches=card.querySelector('.editorial-swatches');
  if(!image||!swatches)continue;
  swatches.addEventListener('click',event=>{
   const button=event.target.closest('[data-card-image]');
   if(!button||!swatches.contains(button))return;
   const source=button.dataset.cardImage;
   if(!source)return;
   image.src=source;
   image.alt=`${card.querySelector('.product-title')?.textContent?.trim()||'Produkt'} – ${button.dataset.cardColor}`;
   image.dataset.colorPrimary=source;
   for(const swatch of swatches.querySelectorAll('[data-card-image]'))swatch.setAttribute('aria-pressed',String(swatch===button));
   image.dispatchEvent(new Event('product-card-color-change'));
  });
 }
}
export function editorialProductCard(product,prices,preferredSku){
 const variants=pricedVariants(product,prices),image=(variants.find(v=>v.sku===preferredSku&&v.images?.[0])||variants.find(v=>v.images?.[0]))?.images[0];
 if(!image)return '';
 const price=prices.products[product.id]?.fromIncVat;
 return `<article class="product-card"><a class="product-image" href="/design/${escape(product.id)}"><img src="${escape(image)}" alt="${escape(product.name)}" loading="lazy" decoding="async" width="500" height="500"></a><div class="card-meta"><span>${escape(product.brand)}</span>${productColorSwatches(variants,image)}</div><a class="product-title" href="/design/${escape(product.id)}">${escape(product.name)}</a>${Number.isFinite(price)?`<p class="editorial-price">Fra ${new Intl.NumberFormat('da-DK',{style:'currency',currency:'DKK'}).format(price/100)}</p>`:''}</article>`;
}
