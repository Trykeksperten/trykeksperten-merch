// Products stay in the supplier catalog. Unpriced Citizen Green launches are
// previewed, while other unpriced products remain unpublished.

export function isShopProduct(product, priceData) {
 return Boolean(priceData?.available && (priceData.products?.[product.id] || priceData.quoteOnlyIds?.includes(product.id) || priceData.comingSoonIds?.includes(product.id)));
}

export function isQuoteOnlyProduct(product, priceData) {
 return isShopProduct(product, priceData) && !priceData.products?.[product.id] && !isComingSoonProduct(product, priceData);
}

export function isComingSoonProduct(product, priceData) {
 return Boolean(priceData?.available && !priceData.products?.[product.id] && priceData.comingSoonIds?.includes(product.id));
}

export function shopProducts(catalog, priceData) {
 return catalog?.products.filter(product => isShopProduct(product, priceData)) || [];
}

export function pricedVariants(product, priceData) {
 if (!priceData?.available) return [];
 return product.variants.filter(variant => !variant.discontinued && Boolean(priceData.skus?.[variant.sku]));
}
