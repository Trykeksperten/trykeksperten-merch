/**
 * Server-only provider contract. A real adapter must normalize a COMPLETE successful
 * snapshot into { supplierId, complete: true, records: [{productId, canonicalKey?,
 * status, title, category, images, variants, certifications, stock, printMethods,
 * quantityTiers, purchasePrice, currency, updatedAt}] }.
 * No PF Concept or Promidata endpoint is assumed or implemented.
 * canonicalKey is a verified manufacturer/GTIN mapping, never a fuzzy name match.
 */
export function mergeSnapshot(previous, snapshot, overrides = {}, now = new Date().toISOString()) {
 if (!snapshot || snapshot.complete !== true || !Array.isArray(snapshot.records) || !snapshot.records.length || !snapshot.supplierId) {
  return { ...previous, sync: { status: 'error', attemptedAt: now, message: 'Incomplete or empty snapshot; previous catalog retained.' } };
 }
 const keys = new Set();
 for (const item of snapshot.records) {
  if (!item.productId || keys.has(item.productId)) return { ...previous, sync: { status: 'error', attemptedAt: now, message: 'Missing or duplicate provider product ID; previous catalog retained.' } };
  keys.add(item.productId);
 }
 const sources = { ...(previous.sources || {}) };
 for (const [key, item] of Object.entries(sources)) if (item.supplierId === snapshot.supplierId && !keys.has(item.productId)) sources[key] = { ...item, status: 'discontinued' };
 for (const item of snapshot.records) sources[`${snapshot.supplierId}:${item.productId}`] = { ...item, supplierId: snapshot.supplierId };
 const grouped = new Map();
 for (const [sourceKey,item] of Object.entries(sources)) {
  const key = item.canonicalKey || sourceKey;
  const group = grouped.get(key) || { id: key, sources: [], editorial: overrides[key] || {} };
  group.sources.push(item); grouped.set(key, group);
 }
 // Editorial content and sales rules live outside supplier-owned snapshots.
 // Multiple sources are retained; procurement routing must be explicitly chosen.
 return { sources, products: [...grouped.values()], sync: { status: 'ok', updatedAt: now, supplierId: snapshot.supplierId } };
}
export function publicProduct(p) {
 // Allowlist: purchasePrice, provider tokens and private sales-rule configuration
 // can never be serialized by this projection.
 const { id,name,category,material,brand,description,colors,sizes,minimum,price,prints,
 options,art,demo,sku,certifications,stock,leadTime,tiers,variants,status } = p;
 return { id,name,category,material,brand,description,colors,sizes,minimum,price,prints,
 options,art,demo,sku,certifications,stock,leadTime,tiers,variants,status };
}
