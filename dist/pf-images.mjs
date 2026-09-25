// Placement illustrations from PF can be cropped around the printable area.
// Use the complete product photograph in small selection cards instead.
export function placementThumbnailImage(variant, option){
 const images=variant?.images||[];
 const location=String(option?.impLocation||'').toLowerCase();
 const view=/\b(bagside|bagpå|back|rear)\b/.test(location)?'B':/\b(forside|foran|front)\b/.test(location)?'F':null;
 const matching=view&&images.find(src=>new RegExp(`_${view}1\\.[a-z0-9]+$`,'i').test(new URL(src,'https://images.pfconcept.com').pathname));
 return matching||images[0]||option?.image||option?.svg||'';
}
