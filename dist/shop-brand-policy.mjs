export function isInternalShopBrand(product){
 return product?.brandId==='trykeksperten-select'||product?.id==='trykeksperten-select'||/trykeksperten/i.test(product?.brand||product?.name||'');
}
export function publicProductBrand(product){
 return isInternalShopBrand(product)?{...product,brand:''}:product;
}

export function isHiddenShopBrand(product){
 return [product?.brandId,product?.brand].some(value=>String(value||'').trim().toLowerCase()==='roly');
}
