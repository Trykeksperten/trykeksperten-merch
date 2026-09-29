// Products stay in the supplier catalog. The public shop shows every product
// with a current price, including products that have a supplier minimum.

export function isShopProduct(product, priceData) {
 return Boolean(priceData?.available && priceData.products?.[product.id] && pricedVariants(product,priceData).length);
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
 return product.variants.filter(variant => !variant.discontinued && Boolean(priceData.skus?.[variant.sku]));
}
