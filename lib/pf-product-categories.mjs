// Keep shop merchandising independent of PF's supplier taxonomy.
const exhibitionCategories = new Set([
  'Sticky notes', 'Dokument mapper', 'Lanyard', 'Badgeholdere', 'Konferencetasker'
]);

export function classifyShopProduct(product) {
  const category = product.supplierCategory ?? product.category;
  const exhibition = exhibitionCategories.has(category)
    || /sticky[\s-]*mate|konferencemappe|festival\s*armbånd/i.test(product.name || '');
  if (!exhibition) return product;
  return {...product, supplierCategory: category, category: 'Messe', shopCategory: 'giveaways', group: 'Giveaways'};
}
