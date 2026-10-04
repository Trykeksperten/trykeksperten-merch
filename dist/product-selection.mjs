export const variantColorKey=variant=>String(variant.colorCode||variant.color||'standard');
export function colorGroups(variants){
 const groups=new Map();
 for(const variant of variants){const key=variantColorKey(variant);if(!groups.has(key))groups.set(key,{key,name:variant.color||'Standard',hex:variant.hex,variants:[]});groups.get(key).variants.push(variant);}
 return [...groups.values()];
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
