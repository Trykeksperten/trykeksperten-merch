export const variantColorKey=variant=>String(variant.colorCode||variant.color||'standard');
const sizeOrder=['XXXS','XXS','XS','S','M','L','XL','XXL','XXXL','4XL','5XL','6XL','7XL','8XL'];
const normalizedSize=value=>String(value||'').trim().toUpperCase().replace(/^2XL$/,'XXL').replace(/^3XL$/,'XXXL');
function compareSizes(a,b){
 const left=normalizedSize(a.size),right=normalizedSize(b.size),li=sizeOrder.indexOf(left),ri=sizeOrder.indexOf(right);
 if(li>=0&&ri>=0)return li-ri;
 if(li>=0||ri>=0)return li>=0?-1:1;
 return left.localeCompare(right,'da',{numeric:true});
}
export function colorGroups(variants){
 const groups=new Map();
 for(const variant of variants){const key=variantColorKey(variant);if(!groups.has(key))groups.set(key,{key,name:variant.color||'Standard',hex:variant.hex,variants:[]});groups.get(key).variants.push(variant);}
 return [...groups.values()].map(group=>({...group,variants:group.variants.sort(compareSizes)}));
}
export function selectedSizeRows(variants,quantities){
 const rows=[];
 for(const variant of variants){const quantity=Number(quantities[variant.sku]||0);if(!Number.isInteger(quantity)||quantity<0||quantity>100000)throw Error('Angiv hele antal mellem 0 og 100.000 pr. størrelse.');if(quantity)rows.push({variant,quantity});}
 if(!rows.length)throw Error('Vælg antal i mindst én størrelse.');
 if(rows.reduce((sum,row)=>sum+row.quantity,0)>100000)throw Error('Vælg højst 100.000 stk. i alt.');
 return rows;
}
export function selectionLines(product,source,line,rows){
 return rows.map(({variant,quantity})=>({...line,sku:variant.sku,quantity,decorations:line.decorations.map(design=>{
  const original=source.options.find(option=>option.id===design.optionId);
  const fields=['impMethodCode','impLocation','printCode','impWidthMm','impHeightMm','impDiameterMm'];
  const matching=original&&variant.options.filter(option=>fields.every(field=>String(option[field]||'')===String(original[field]||'')));
  const target=matching?.find(option=>option.id===original.id)||(matching?.length===1?matching[0]:null);
  if(!target)throw Error(`Trykplaceringen passer ikke til størrelse ${variant.size||variant.sku}. Vælg denne størrelse separat.`);
  return {...structuredClone(design),optionId:target.id,sku:variant.sku,quantity};
 })}));
}

// Preserve each selected size when changing the product colour. Never silently drop units.
export function transferColourQuantities(sourceVariants,quantities,targetVariants){
 const result={};
 for(const source of sourceVariants){const quantity=Number(quantities[source.sku]||0);if(!quantity)continue;
  const target=targetVariants.find(row=>normalizedSize(row.size)===normalizedSize(source.size));
  if(!target)throw Error(`Størrelse ${source.size||'Standard'} findes ikke i denne farve.`);
  result[target.sku]=(result[target.sku]||0)+quantity;
 }
 return result;
}
