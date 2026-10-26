// Use real supplier photographs in a restrained, stable mix of product colours.
// T-shirt hero colours follow the owner-approved reference; explicit customer
// selections still take precedence and only available variants are considered.
const tshirtDisplayColours={'pf-38011':'Skovgrøn','pf-38028':'Orange','pf-39554':'Hvid','pf-39557':'Sandsten','pf-39665':'Sandsten'};
const isTshirt=product=>/t[ -]?shirts?/i.test(product.category||'')||/t[ -]?shirts?/i.test(product.name||'');
function displayColour(variant){
 const name=String(variant.color||'').toLowerCase();
 if(/neon|fluor|lime|pink|rosa|orange|gul|yellow|rød|red|lilla|purple/.test(name))return null;
 const families=[['navy',/navy|marine|midnat/],['green',/skov|oliven|olive|khaki|army|grøn|green|petrol|teal/],['blue',/blå|blue/],['black',/sort|black/],['grey',/grå|grey|gray|antracit|anthracite|charcoal|sølv|silver/],['sand',/sand|beige|natur|natural|havre|cream|creme|ecru|taupe/],['brown',/brun|brown|camel|cognac|bambus|bamboo|kork|cork/]];
 return families.find(([,pattern])=>pattern.test(name))?.[0]||null;
}
export function productDisplayVariant(product,variants=product.variants||[],preferredSku){
 const pictured=variants.filter(variant=>!variant.discontinued&&variant.images?.[0]);
 const preferred=preferredSku&&pictured.find(variant=>variant.sku===preferredSku);
 if(preferred)return preferred;
 const tshirt=isTshirt(product),referenceColour=tshirtDisplayColours[product.id];
 if(tshirt&&referenceColour){const reference=pictured.find(variant=>variant.color===referenceColour);if(reference)return reference;}
 const colours=new Map();
 for(const variant of pictured){
  let family=displayColour(variant);
  if(tshirt){
   if(/^(hvid|white)$/i.test(variant.color||''))family='white';
   if(family==='blue')continue;
   if(family==='green'&&!/skov|oliven|olive|khaki|army|mørk|forest/i.test(variant.color||''))continue;
  }
  if(family&&!colours.has(family))colours.set(family,variant);
 }
 const choices=[...colours.entries()].sort(([a],[b])=>a.localeCompare(b));
 let hash=2166136261;for(const char of String(product.id||product.name||''))hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
 return choices.length?choices[hash%choices.length][1]:pictured[0];
}
