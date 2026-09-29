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
export function editorialProductCard(product,prices,preferredSku){
 const variants=pricedVariants(product,prices),image=(variants.find(v=>v.sku===preferredSku&&v.images?.[0])||variants.find(v=>v.images?.[0]))?.images[0];
 if(!image)return '';
 const price=prices.products[product.id]?.fromIncVat;
 const colors=[...new Set(variants.map(v=>v.hex).filter(hex=>/^#[a-f0-9]{6}$/i.test(hex)))];
 return `<article class="product-card"><a class="product-image" href="/design/${escape(product.id)}"><img src="${escape(image)}" alt="${escape(product.name)}" loading="lazy" decoding="async" width="500" height="500"></a><div class="card-meta"><span>${escape(product.brand)}</span><span class="editorial-swatches" aria-label="${colors.length} farver">${colors.slice(0,5).map(hex=>`<i style="background:${hex}"></i>`).join('')}</span></div><a class="product-title" href="/design/${escape(product.id)}">${escape(product.name)}</a>${Number.isFinite(price)?`<p class="editorial-price">Fra ${new Intl.NumberFormat('da-DK',{style:'currency',currency:'DKK'}).format(price/100)}</p>`:''}</article>`;
}
