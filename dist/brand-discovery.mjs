import {brandEditorialImages} from './brand-editorial.mjs?v=3';
import {pricedVariants} from './pf-visibility.mjs';
import {isInternalShopBrand} from './shop-brand-policy.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const visitSeed=Math.floor(Math.random()*0x7fffffff);
const editorialBrands=['ocean-bottle','stanley-1913','herschel','thule','hydro-flask','larq','moleskine','miir','parker','waterman','karst','wellmark','xtorm','scx-design','case-logic','seasons','mepal','camelbak'];
const largePhotoBrands=new Set(['ocean-bottle','stanley-1913','herschel','hydro-flask','thule','karst','moleskine','miir','larq','camelbak','wellmark','waterman','parker']);
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
export function brandDiscoveryGroups(brands,products,prices,{category='',selected='',seed=visitSeed,limit=Infinity}={}){
 const groups=brands.filter(brand=>brand.id!=='elevate'&&!isInternalShopBrand(brand)&&(!category||brand.group===category)&&(!selected||brand.id===selected)).map(brand=>{
  const matches=products.filter(p=>p.brandId===brand.id),featured=selectDiscoveryProducts(matches,prices,{seed});
  const images=brandEditorialImages(brand.id),image=images[0]||'';
  return {brand,products:featured,image,images};
 }).filter(group=>group.products.length&&group.image);
 return groups.sort((a,b)=>editorialBrands.indexOf(a.brand.id)-editorialBrands.indexOf(b.brand.id)).slice(0,limit).sort((a,b)=>{const priority=id=>id==='ocean-bottle'?0:id==='stanley-1913'?1:2;return priority(a.brand.id)-priority(b.brand.id)||score(a.brand.id,seed)-score(b.brand.id,seed)||a.brand.id.localeCompare(b.brand.id);}).map((group,index)=>({...group,layout:index%4}));
}
export function galleryImageFormat(image){
 const dimensions=[...image.matchAll(/width="(\d+)" height="(\d+)"/g)].map(([,width,height])=>({width:Number(width),height:Number(height)}));
 return {ratio:dimensions.reduce((sum,d)=>sum+d.width/d.height,0)||1,width:Math.min(...dimensions.map(d=>d.width))};
}
export function brandDiscoveryPage(brands,search,products=[],prices){
 const params=new URLSearchParams(search),groups=brandDiscoveryGroups(brands,products,prices,{category:params.get('kategori')||'',selected:params.get('brand')||''});
 const tiles=[];
 for(let round=0;round<Math.max(0,...groups.map(group=>group.images.length));round++){
  for(const {brand,images} of groups){
   const image=images[round];if(!image)continue;
   const format=galleryImageFormat(image);
   tiles.push({ratio:format.ratio,width:format.width,featured:largePhotoBrands.has(brand.id)&&format.width>=1200&&format.ratio<3,html:`<a class="brand-gallery-tile${format.ratio>=1.5?' brand-gallery-tile--wide':''}" style="--image-ratio:${format.ratio.toFixed(4)}" data-discovery-brand="${escape(brand.id)}" href="/produkter?brand=${encodeURIComponent(brand.id)}" aria-label="Se produkter fra ${escape(brand.name)}">${image}</a>`});
  }
 }
 const rows=[];let row=[],ratio=0;
 const flush=()=>{
  if(row.length){
   const total=row.reduce((sum,tile)=>sum+tile.ratio,0),gaps=(row.length-1)*24;
   const featured=row.some(tile=>tile.featured),height=featured?900:row.every(tile=>tile.width>=1400)?500:360;
   const maxWidth=Math.floor(Math.min(total*height+gaps,...row.map(tile=>tile.width/tile.ratio*total+gaps)));
   rows.push(`<div class="brand-gallery-row${featured?' brand-gallery-row--featured':''}" style="max-width:${maxWidth}px">${row.map(tile=>tile.html).join('')}</div>`);
  }
  row=[];ratio=0;
 };
 for(const tile of tiles){
  if(row.length&&row[0].featured!==tile.featured)flush();
  if(tile.ratio>=3||tile.featured&&tile.ratio>=1.5){flush();row.push(tile);flush();continue;}
  row.push(tile);ratio+=tile.ratio;
  if(ratio>=3.4||row.length>=(tile.featured?2:4))flush();
 }
 flush();
 return `<section class="wrap brand-discovery-feed"><h1 class="sr-only">Udforsk alle brands</h1><div class="brand-gallery">${rows.join('')}</div></section>`;
}
