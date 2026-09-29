const products=new Map(),photos=new Map();
async function productDetails(id){
 if(!products.has(id))products.set(id,fetch(`/api/pf-product/${encodeURIComponent(id)}`).then(response=>{if(!response.ok)throw Error();return response.json();}).catch(error=>{products.delete(id);throw error;}));
 return products.get(id);
}
async function loadPhoto(source){
 if(!photos.has(source))photos.set(source,new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(true);image.onerror=()=>resolve(false);image.src=source;}));
 return photos.get(source);
}
export function alternateProductImages(product,primary){
 const variant=product.variants.find(variant=>variant.images?.includes(primary));
 // Keep the colour of the card; only use photographs from the same variant.
 return [...new Set(variant?.images||[])].filter(source=>source!==primary).sort((a,b)=>{
  const priority=source=>/_[BF][0-9]+\./i.test(source)?0:/_D[0-9]+\./i.test(source)?1:2;
  return priority(a)-priority(b);
 });
}
export function bindProductImageHover(root){
 for(const card of root.querySelectorAll('.product-card')){
  const link=card.querySelector('a.product-image[href^="/design/"]'),image=link?.querySelector('img');
  if(!image)continue;
  const id=link.getAttribute('href').split('/').pop(),primary=image.getAttribute('src');
  let hovered=false,focused=false,alternate=null,pending=null;
  const paint=()=>{if(image.isConnected)image.src=(hovered||focused)&&alternate?alternate:primary;};
  const prepare=async()=>{
   if(alternate){paint();return;}
   if(!pending)pending=(async()=>{try{const product=await productDetails(id);for(const source of alternateProductImages(product,primary)){if(await loadPhoto(source)){alternate=source;break;}}}catch{}finally{pending=null;}})();
   await pending;paint();
  };
  card.addEventListener('pointerenter',event=>{if(event.pointerType!=='mouse')return;hovered=true;prepare();});
  card.addEventListener('pointerleave',()=>{hovered=false;paint();});
  card.addEventListener('focusin',()=>{focused=true;prepare();});
  card.addEventListener('focusout',event=>{if(card.contains(event.relatedTarget))return;focused=false;paint();});
 }
}
