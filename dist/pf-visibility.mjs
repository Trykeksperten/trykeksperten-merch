// Products stay in the supplier catalog, while the public shop initially shows
// only products and variants that can be ordered from one piece.

export function isShopProduct(product, priceData) {
 return Boolean(priceData?.available && priceData.products?.[product.id]?.fromQuantity===1 && pricedVariants(product,priceData).length);
}

export function isQuoteOnlyProduct(product, priceData) {
 return false;
}

export function isComingSoonProduct(product, priceData) {
 return false;
}

export function shopProducts(catalog, priceData) {
 return catalog?.products.filter(product => isShopProduct(product, priceData)) || [];
}

export function pricedVariants(product, priceData) {
 if (!priceData?.available) return [];
 return product.variants.filter(variant => !variant.discontinued && Boolean(priceData.skus?.[variant.sku]) && (priceData.skuMinimums?priceData.skuMinimums[variant.sku]===1:priceData.products?.[product.id]?.fromQuantity===1));
}
