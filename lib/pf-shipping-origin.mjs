// PF supplies productionLocation on decoration options. This is the routing
// evidence used by checkout, not the product's country of manufacture.
const names={PL:'Polen',UK:'Storbritannien',GB:'Storbritannien',FR:'Frankrig',ES:'Spanien',NL:'Nederlandene',DE:'Tyskland',IT:'Italien',PT:'Portugal',BE:'Belgien'};
export function shippingOrigin(product){
 if(product.shippingOrigin)return product.shippingOrigin;
 const variants=(product.variants||[]).filter(v=>!v.discontinued);
 const codes=new Set();let unknown=variants.length===0;
 for(const variant of variants){
  if(!variant.options?.length)unknown=true;
  for(const option of variant.options||[]){const code=String(option.productionLocation||'').trim().toUpperCase();if(code)codes.add(code==='GB'?'UK':code);else unknown=true;}
 }
 const countries=[...codes].sort();
 return {countries,unknown,source:'PF productionLocation'};
}
export function shippingCountryLabel(product){const origin=shippingOrigin(product);return [...origin.countries.map(code=>names[code]||code),...(origin.unknown?['Land ikke oplyst']:[])].join(', ')||'Land ikke oplyst';}
export function isPolandProduct(product){const origin=shippingOrigin(product);return !origin.unknown&&origin.countries.length===1&&origin.countries[0]==='PL';}
