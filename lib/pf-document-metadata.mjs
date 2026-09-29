export function productDocumentMetadata(model){
 const attributes=Array.isArray(model.attributes?.attribute)?model.attributes.attribute:[];
 const certifications=[...new Set(attributes.filter(a=>a.productAttributeCode==='pa_certifications_environmental').flatMap(a=>String(a.attributeSetting||'').split(',')).map(s=>s.trim()).filter(Boolean))];
 const hasSizes=(model.items||[]).some(({item})=>Boolean(item?.sizeGrid));
 return {certifications,hasSizes};
}
