export const premiumBrands=['stanley-1913','thule','hydro-flask','moleskine','ocean-bottle','larq','herschel','miir','waterman'];
export const isHighEndProduct=product=>premiumBrands.includes(product.brandId);
export const isHighEndSelection=params=>params.get('udvalg')==='high-end'||params.get('niveau')==='premium';
