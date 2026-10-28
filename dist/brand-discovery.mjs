import {brandEditorialBlocks} from './brand-editorial.mjs';
import {editorialProductCard} from './product-editorial.mjs?v=9';
import {pricedVariants} from './pf-visibility.mjs';
import {isInternalShopBrand} from './shop-brand-policy.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const visitSeed=Math.floor(Math.random()*0x7fffffff);
const editorialBrands=['ocean-bottle','stanley-1913','herschel','thule','hydro-flask','larq','moleskine','miir','parker','waterman','karst','wellmark','xtorm','scx-design','case-logic','seasons','mepal','camelbak'];
const editorPicks=new Set(['pf-100834','pf-120632','pf-100990','pf-120692','pf-100897','pf-100751','pf-107151','pf-106483','pf-106367','pf-100932','pf-107790']);
function score(value,seed){let hash=seed|0;for(const char of value)hash=Math.imul(hash^char.charCodeAt(0),16777619);return hash>>>0;}
const priceOf=(product,prices)=>Number(prices?.products?.[product.id]?.fromIncVat)||0;
const popularity=product=>Number.isFinite(product.popularity)?product.popularity:-Infinity;
export function selectDiscoveryProducts(products,prices,{seed=visitSeed,limit=3}={}){
 const available=products.filter(p=>pricedVariants(p,prices).some(v=>v.images?.length)),selected=[];
 const add=product=>{if(product&&!selected.some(p=>p.id===product.id))selected.push(product);};
 const tie=(a,b)=>score(a.id,seed)-score(b.id,seed)||a.id.localeCompare(b.id);
 // One editorial favourite, a PF popularity leader and a premium price choice.
 add([...available].filter(p=>editorPicks.has(p.id)).sort(tie)[0]);
 add([...available].sort((a,b)=>popularity(b)-popularity(a)||tie(a,b))[0]);
 add([...available].sort((a,b)=>priceOf(b,prices)-priceOf(a,prices)||tie(a,b))[0]);
 for(const product of [...available].sort((a,b)=>popularity(b)-popularity(a)||priceOf(b,prices)-priceOf(a,prices)||tie(a,b)))add(product);
 return selected.slice(0,limit);
}
export function brandDiscoveryGroups(brands,products,prices,{category='',selected='',seed=visitSeed,limit=14}={}){
 const groups=brands.filter(brand=>!isInternalShopBrand(brand)&&(!category||brand.group===category)&&(!selected||brand.id===selected)&&(selected||editorialBrands.includes(brand.id))).map(brand=>{
  const matches=products.filter(p=>p.brandId===brand.id),featured=selectDiscoveryProducts(matches,prices,{seed});
  const image=[...brandEditorialBlocks(brand.id,Math.min(matches.length,24)).values()][0]||'';
  return {brand,products:featured,image};
 }).filter(group=>group.products.length&&group.image);
 return groups.sort((a,b)=>editorialBrands.indexOf(a.brand.id)-editorialBrands.indexOf(b.brand.id)).slice(0,limit).sort((a,b)=>{const priority=id=>id==='ocean-bottle'?0:id==='stanley-1913'?1:2;return priority(a.brand.id)-priority(b.brand.id)||score(a.brand.id,seed)-score(b.brand.id,seed)||a.brand.id.localeCompare(b.brand.id);}).map((group,index)=>({...group,layout:index%4}));
}
export function brandDiscoveryPage(brands,search,products=[],prices){
 const params=new URLSearchParams(search),groups=brandDiscoveryGroups(brands,products,prices,{category:params.get('kategori')||'',selected:params.get('brand')||''});
 let column=0;
 const content=groups.map(({brand,products:featured,image},index)=>{
  const photo=`<div class="brand-grid-photo brand-grid-photo--${index%2?'right':'left'}" data-discovery-brand="${escape(brand.id)}" aria-label="${escape(brand.name)}">${image}</div>`;
  const cards=featured.map(product=>editorialProductCard(product,prices));
  const photoColumn=index%2?2:0,before=Math.min((photoColumn-column+4)%4,cards.length);
  const tiles=[...cards.slice(0,before),photo,...cards.slice(before)];
  column=(photoColumn+2+cards.length-before)%4;
  return `<section class="brand-grid-group" data-discovery-brand="${escape(brand.id)}" aria-label="Udvalgt fra ${escape(brand.name)}">${tiles.join('')}</section>`;
 }).join('');
 return `<section class="brand-collage-intro wrap"><p class="eyebrow">SMERCH · BRANDS</p><h1>Udforsk vores brands.</h1><p>Udvalgte favoritter, populære valg og design lidt ud over det sædvanlige.</p></section><section class="home-featured wrap brand-discovery-feed"><div class="product-grid editorial-grid brand-collage">${content}</div></section>`;
}
