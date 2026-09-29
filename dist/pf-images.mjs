// Placement illustrations from PF can be cropped around the printable area.
// Use the complete product photograph in small selection cards instead.
export function placementThumbnailImage(variant, option){
 const images=variant?.images||[];
 const location=String(option?.impLocation||'').toLowerCase();
 const view=/\b(bagside|bagpå|back|rear)\b/.test(location)?'B':/\b(forside|foran|front)\b/.test(location)?'F':null;
 const matching=view&&images.find(src=>new RegExp(`_${view}1\\.[a-z0-9]+$`,'i').test(new URL(src,'https://images.pfconcept.com').pathname));
 return matching||images[0]||option?.image||option?.svg||'';
}

// PF's unresized public product photograph; keep the feed URL as fallback.
export function originalProductImage(source){
 try{const url=new URL(source);if(url.hostname!=='images.pfconcept.com'||!url.pathname.startsWith('/ProductImages_All/JPG/'))return source;
 const name=decodeURIComponent(url.pathname.split('/').pop()).toLowerCase();if(!/^[a-z0-9][a-z0-9_.-]*\.(jpg|jpeg|png)$/.test(name))return source;
 return `https://www.pfconcept.com/media/catalog/product/${name[0]}/${name[1]}/${encodeURIComponent(name)}`;
 }catch{return source;}
}
