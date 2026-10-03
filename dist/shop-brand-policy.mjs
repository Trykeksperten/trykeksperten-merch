export function isHiddenShopBrand(product){
 return [product?.brandId,product?.brand].some(value=>String(value||'').trim().toLowerCase()==='roly');
}
