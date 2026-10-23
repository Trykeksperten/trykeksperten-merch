// PF Store quote supplied by Joakim, 23 October 2026. Only this internal
// Grafton pilot gets this freight price; public customer freight is unchanged.
export function pilotFreightExVat(lines){
 if(lines?.length!==1)return null;
 const line=lines[0],d=line.decorations?.[0];
 return line.productId==='pf-38687'&&line.sku==='38687070'&&line.quantity===10&&line.decorations?.length===1&&d?.optionId==='printdata_cse1_dk_label_v3:8182'&&Number(d.width)===85&&Number(d.height)===25&&Number(d.colors)===1?6500:null;
}
