import {brandEditorialImages} from './brand-editorial.mjs?v=4';
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
 const rows=composeGallery(tiles);

 return `<section class="wrap brand-discovery-feed"><h1 class="sr-only">Udforsk alle brands</h1><div class="brand-gallery">${rows.join('')}</div></section>`;
}

// A portrait pair, alternating large photo + small stack, and compact campaign rows.
// Both column widths and stack heights use the source ratios: no cropping or empty cells.
export function composeGallery(tiles){
 const remaining=[...tiles],rows=[];
 const leaf=tile=>({ratio:tile.ratio,tiles:[tile]});
 const stack=items=>({ratio:1/items.reduce((sum,t)=>sum+1/t.ratio,0),tiles:items});
 const render=columns=>{
  const ratio=columns.reduce((sum,c)=>sum+c.ratio,0);
  const stackGap=columns.reduce((sum,c)=>sum+c.ratio*(c.tiles.length-1),0);
  const gapFactor=columns.length-1-stackGap;
  const html=columns.map(c=>`<div class="brand-gallery-column${c.tiles.length>1?' brand-gallery-column--stack':''}" style="--column-ratio:${c.ratio};--stack-gaps:${c.tiles.length-1}">${c.tiles.map(t=>t.html).join('')}</div>`).join('');
  rows.push(`<div class="brand-gallery-row${columns.some(c=>c.tiles.length>1)?' brand-gallery-row--composition':''}${columns.some(c=>c.tiles.some(t=>t.featured))?' brand-gallery-row--featured':''}" style="--row-ratio:${ratio};--row-gap-factor:${gapFactor}">${html}</div>`);
 };
 // Keep Ocean Bottle and Stanley at the beginning.
 if(remaining.length>=2)render([leaf(remaining.shift()),leaf(remaining.shift())]);
 let alternate=false;
 while(remaining.length){
  const heroIndex=remaining.findIndex(t=>t.featured&&t.ratio<2.8);
  const first=remaining.splice(heroIndex>=0?heroIndex:0,1)[0];
  if(first.featured&&first.ratio<2.8&&remaining.length>=2){
   const companions=[];
   for(let i=0;i<2;i++){
    const candidate=remaining.findIndex(t=>!t.featured&&t.ratio>=1&&t.ratio<3);
    if(candidate<0)break;
    companions.push(remaining.splice(candidate,1)[0]);
   }
   if(companions.length===2){
    const columns=[leaf(first),stack(companions)];
    if(alternate)columns.reverse();
    render(columns);alternate=!alternate;continue;
   }
   remaining.unshift(...companions);
  }
  const group=[first];
  let sum=first.ratio;
  while(remaining.length&&group.length<3&&sum<3.8){
   const candidate=remaining.findIndex(t=>!t.featured||first.ratio<1&&t.ratio<1);
   if(candidate<0)break;
   const next=remaining.splice(candidate,1)[0];group.push(next);sum+=next.ratio;
  }
  render(group.map(leaf));
 }
 return rows;
}
