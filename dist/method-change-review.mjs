// Product colour and size may change option IDs. Review follows the actual print method and area.
const key=o=>JSON.stringify(['impMethodCode','impLocation','printCode','impWidthMm','impHeightMm','impDiameterMm'].map(field=>String(o?.[field]||'')));
export function createMethodReview(){
 const required=new Set();
 return {require(options){required.clear();for(const option of options)required.add(key(option));},pending:option=>required.has(key(option)),saved:option=>required.delete(key(option))};
}
