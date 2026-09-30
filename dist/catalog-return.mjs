import {productGroups} from './product-groups.mjs?v=22';
export function productDetailURL(id,search=''){
 const query=new URLSearchParams(search);query.delete('from');
 const origin='/produkter'+(query.size?'?'+query:'');
 return '/design/'+encodeURIComponent(id)+'?'+new URLSearchParams({from:origin});
}
export function catalogReturn(product,search=''){
 const group=productGroups.find(group=>group.id===product.shopCategory);
 const fallback={href:group?'/produkter?'+new URLSearchParams({kategori:group.id}):'/produkter',label:group?.name||'Alle produkter'};
 const from=new URLSearchParams(search).get('from');
 if(!from||!/^\/produkter(?:\?|$)/.test(from))return fallback;
 const url=new URL(from,'https://smerch.invalid');
 if(url.origin!=='https://smerch.invalid'||url.pathname!=='/produkter')return fallback;
 const category=productGroups.find(group=>group.id===url.searchParams.get('kategori'));
 return {href:url.pathname+url.search,label:url.searchParams.get('underkategori')||category?.name||'Alle produkter'};
}
