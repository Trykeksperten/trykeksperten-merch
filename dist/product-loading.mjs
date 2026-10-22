const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Shared by the initial server response and client-side product navigation.
export function productLoading(product,sku=''){
 const variants=product?.variants||[],variant=variants.find(v=>v.sku===sku&&v.images?.[0])||variants.find(v=>!v.discontinued&&v.images?.[0]),image=variant?.images?.[0];
 return `<section class="wrap pf-product-loading" aria-busy="true"></section><noscript><style>.pf-product-loading{display:none}</style><section class="wrap section"><h1>${escape(product?.name||'Produkt')}</h1>${image?`<img class="seo-product-image" src="${escape(image)}" alt="${escape(product.name)} i farven ${escape(variant.color||'vist variant')}" width="500" height="500">`:''}</section></noscript>`;
}
