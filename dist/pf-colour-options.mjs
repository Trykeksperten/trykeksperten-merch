const colourBased = dependence => ['color', 'colour', 'colors', 'colours'].includes(String(dependence || '').toLowerCase());

// PF prices some methods by the number of colours. Others, such as fixed
// embroidery, allow several thread colours while charging one fixed setup.
export function placementColourOptions(option, priceOption) {
 const max = /^\d+$/.test(String(option?.maxColours || '').trim()) ? Number(option.maxColours) : 1;
 const rows = Array.isArray(priceOption?.rows) ? priceOption.rows : [];
 if (colourBased(priceOption?.dependence)) {
  return rows.filter(row => Number.isInteger(row.colors) && row.colors >= 1 && row.colors <= max)
   .sort((a, b) => a.colors - b.colors)
   .map(row => ({ colors: row.colors, row }));
 }
 if (!Number.isInteger(max) || max < 2) return [];
 return Array.from({ length: max }, (_, index) => ({ colors: index + 1, row: rows[0] || null }));
}

export function hasColourDependentSetup(priceOption) {
 return colourBased(priceOption?.dependence);
}
