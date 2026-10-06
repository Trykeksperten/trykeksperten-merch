// Keep shop merchandising independent of PF's supplier taxonomy.
const exhibitionCategories = new Set([
  'Sticky notes', 'Dokument mapper', 'Lanyard', 'Badgeholdere', 'Konferencetasker'
]);

export function classifyShopProduct(product) {
  const category = product.supplierCategory ?? product.category;
  if (product.shopCategory === 'tasker' && category === 'Bomuldstasker') {
    const name = product.name || '';
    const shopCategory = /mulepose/i.test(name) ? 'Muleposer' : /brødpose|fødevarer/i.test(name) ? 'Madposer' : category;
    if (shopCategory !== category) return {...product, supplierCategory: category, category: shopCategory};
  }
  const exhibition = exhibitionCategories.has(category)
    || /sticky[\s-]*mate|konferencemappe|festival\s*armbånd/i.test(product.name || '');
  if (!exhibition && product.shopCategory !== 'giveaways') return product;
  return {...product, supplierCategory: category, category, shopCategory: 'giveaways', group: 'Messe'};
}
