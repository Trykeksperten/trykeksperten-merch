import {brandDiscoveryPage} from './brand-discovery.mjs';
import {bindContinuousRibbon} from './brand-ribbon-motion.mjs?v=4';
import {brandLogoURL} from './brand-logos.mjs';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
import {pricedVariants} from './pf-visibility.mjs';
const logo=b=>brandLogoURL(b)?`<img class="brand-logo" src="${escape(brandLogoURL(b))}" alt="${escape(b.name)}" decoding="async">`:`<span class="brand-logo brand-logo-text">${escape(b.name)}</span>`;
const previewProducts={camelbak:'pf-100886',elevate:'pf-38687',herschel:'pf-120691','hydro-flask':'pf-100990',karst:'pf-107790',larq:'pf-100897',miir:'pf-100932',moleskine:'pf-107151','ocean-bottle':'pf-100751',parker:'pf-106476','stanley-1913':'pf-100834',thule:'pf-120632',waterman:'pf-106367'};
const previewSkus={camelbak:'10088664','hydro-flask':'10099052',larq:'10089790',miir:'10093255'};
export function brandPreview(brands,products=[],prices){
 const productImage=product=>{
  const variants=pricedVariants(product,prices);
  return (variants.find(variant=>variant.sku===previewSkus[product.brandId]&&variant.images?.[0])||variants.find(variant=>variant.images?.[0]))?.images[0];
 };
 const featured=brands.map(brand=>{
  const matches=products.filter(product=>product.brandId===brand.id);
  const product=matches.find(item=>item.id===previewProducts[brand.id]&&productImage(item))||matches.find(productImage);
  return {...brand,productName:product?.name,productImage:product&&productImage(product)};
 });
 const group=duplicate=>`<div class="brand-marquee-group" ${duplicate?'aria-hidden="true"':''}>${featured.map(b=>`<a href="/produkter?brand=${escape(b.id)}" aria-label="Se produkter fra ${escape(b.name)}" ${duplicate?'tabindex="-1"':''}>${b.productImage?`<img class="brand-product-image" src="${escape(b.productImage)}" alt="${escape(b.productName)}" loading="eager" decoding="async" width="500" height="500">`:''}${logo(b)}</a>`).join('')}</div>`;
 return `<section class="brand-preview home-brand-preview" aria-label="Udvalgte brands"><h2 class="sr-only">Udvalgte brands</h2><div class="brand-marquee"><div class="brand-wordmarks">${group(false)}${group(true)}</div></div></section>`;
}

export function brandsPage(brands,search,products=[],prices){return brandDiscoveryPage(brands,search,products,prices);}

// Native links remain clickable while the owner-requested ribbon runs continuously.
export function bindBrandPreview(root=document){
 for(const track of root.querySelectorAll('.home-brand-preview .brand-wordmarks')){
  bindContinuousRibbon(track);
 }
}
