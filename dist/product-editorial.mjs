import {notebookPaperBadge} from './notebook-pages.mjs?v=2';
import {productDisplayVariant} from './product-display-variant.mjs?v=2';
import {fromInc,vatLabel} from './customer-pricing.mjs';
import {pricedVariants} from './pf-visibility.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
// Lifestyle photographs for the featured product stories.
const stories={
 'pf-100834':{image:'/assets/stanley-quencher-people.jpg',width:800,height:800,alt:'To personer med orange og turkis Stanley Quencher',title:'Med på hele dagen.',label:'Stanley Quencher',crop:'stanley-people'},
 'pf-107790':{image:'/assets/karst-orange-journal.webp',width:1080,height:1080,alt:'Orange Karst Stone Paper Journal på orange baggrund',title:'Plads til store idéer.',label:'Karst · Notesbøger',crop:'karst-orange'}
};
export function editorialStory(products,id){
 const product=products.find(product=>product.id===id),story=stories[id];
 if(!product||!story)return '';
 return `<a class="product-story product-story--${story.crop}" href="/design/${escape(id)}"><img src="${story.image}" alt="${escape(story.alt||story.label+' i hverdagen')}" loading="lazy" decoding="async" width="${story.width||3000}" height="${story.height||3000}"><div class="product-story-copy"><span>${story.label}</span><h3>${story.title}</h3><span class="product-story-link">Se produktet ↗</span></div></a>`;
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
// A card shows the cheapest size of the pictured colour, never another colour's price.
export function cardPrice(product,prices,image){
 const variants=pricedVariants(product,prices),shown=variants.find(v=>v.images?.includes(image));
 const choices=variants.filter(v=>shown&&(v.colorCode||v.color)===(shown.colorCode||shown.color)).map(v=>prices.variantPrices?.[v.sku]).filter(Boolean);
 if(!choices.length)return null;
 const sorted=choices.toSorted((a,b)=>a.fromIncVat-b.fromIncVat||a.fromQuantity-b.fromQuantity);
 return {...sorted[0],varies:choices.some(p=>p.fromIncVat!==sorted[0].fromIncVat||p.fromQuantity!==sorted[0].fromQuantity)};
}
export function cardPriceHTML(price){
 if(!price)return 'Pris på forespørgsel';
 return `<strong>${price.varies?'Fra ':''}${new Intl.NumberFormat('da-DK',{style:'currency',currency:'DKK'}).format(fromInc(price.fromIncVat,price.fromExVat)/100)} / stk.</strong><small>Ved ${price.fromQuantity} stk. · ${vatLabel()} · uden tryk${price.varies?' · afhænger af størrelse':''}</small>`;
}
export function bindProductColorSwatches(root,products=[],prices={}){
 for(const card of root.querySelectorAll('.product-card')){
  const image=card.querySelector('.product-image img');
  const swatches=card.querySelector('.editorial-swatches');
  const product=products.find(p=>p.id===card.dataset.cardProduct);
  const updatePrice=source=>{const node=card.querySelector('.editorial-price, .pf-card-price');if(product&&prices.products?.[product.id]&&node)node.innerHTML=cardPriceHTML(cardPrice(product,prices,source));};
  const updateLinks=source=>{
   const variant=product&&pricedVariants(product,prices).find(v=>v.images?.includes(source));
   if(!variant)return;
   for(const link of card.querySelectorAll('a.product-image,a.product-title')){
    const url=new URL(link.getAttribute('href'),'https://smerch.dk');
    if(!url.pathname.startsWith('/design/'))continue;
    url.searchParams.set('sku',variant.sku);link.setAttribute('href',url.pathname+url.search);
   }
  };
  if(image){updatePrice(image.getAttribute('src'));updateLinks(image.getAttribute('src'));}

  if(!image||!swatches)continue;
  swatches.addEventListener('click',event=>{
   const button=event.target.closest('[data-card-image]');
   if(!button||!swatches.contains(button))return;
   const source=button.dataset.cardImage;
   if(!source)return;
   image.src=source;
   updatePrice(source);
   updateLinks(source);
   image.alt=`${card.querySelector('.product-title')?.textContent?.trim()||'Produkt'} – ${button.dataset.cardColor}`;
   image.dataset.colorPrimary=source;
   for(const swatch of swatches.querySelectorAll('[data-card-image]'))swatch.setAttribute('aria-pressed',String(swatch===button));
   image.dispatchEvent(new Event('product-card-color-change'));
  });
 }
}
export function editorialProductCard(product,prices,preferredSku){
 const variants=pricedVariants(product,prices),image=productDisplayVariant(product,variants,preferredSku)?.images[0];
 if(!image)return '';
 const price=cardPrice(product,prices,image);
 return `<article class="product-card" data-card-product="${escape(product.id)}"><a class="product-image" href="/design/${escape(product.id)}">${notebookPaperBadge(product)}<img src="${escape(image)}" alt="${escape(product.name)}" loading="lazy" decoding="async" width="500" height="500"></a><div class="card-meta">${productColorSwatches(variants,image)}</div><a class="product-title" href="/design/${escape(product.id)}">${escape(product.name)}</a>${price?`<p class="editorial-price">${cardPriceHTML(price)}</p>`:''}</article>`;
}
