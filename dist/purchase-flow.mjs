export const hasPersonalisation=lines=>Array.isArray(lines)&&lines.some(line=>line.decorations?.length>0);
export const hasBlankProducts=lines=>Array.isArray(lines)&&lines.some(line=>!line.decorations?.length);
export const isMixedPurchase=lines=>hasPersonalisation(lines)&&hasBlankProducts(lines);
export function paymentDescription(lines,locale='da'){
 return locale==='en'?'Payment is authorised when ordering and captured no earlier than dispatch.':'Beløbet reserveres ved bestilling og hæves tidligst ved afsendelse.';
}
export function freightEstimate(fulfillment,config){
 if(config?.freightQuoteRequired)return null;
 if(!fulfillment?.ready||!fulfillment.groups?.length)return null;
 const amounts=fulfillment.groups.map(group=>group.kind==='blank'?config.blankShipping?.freightExVat:(config.freightByLocation?.[group.location]??(fulfillment.groups.length===1?config.freightExVat:null)));
 if(amounts.some(value=>!Number.isFinite(value)||value<=0))return null;
 const exVat=amounts.reduce((sum,value)=>sum+value,0);return {exVat,incVat:exVat+Math.round(exVat*.25)};
}
