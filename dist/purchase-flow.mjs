export const hasPersonalisation=lines=>Array.isArray(lines)&&lines.some(line=>line.decorations?.length>0);
export const hasBlankProducts=lines=>Array.isArray(lines)&&lines.some(line=>!line.decorations?.length);
export const isMixedPurchase=lines=>hasPersonalisation(lines)&&hasBlankProducts(lines);
export function paymentDescription(lines,locale='da'){
 const decorated=hasPersonalisation(lines),mixed=isMixedPurchase(lines);
 if(locale==='en')return mixed?'Personalised products are paid after proof approval; products without printing are paid no earlier than dispatch.':'Payment is authorised when ordering. '+(decorated?'Payment is captured after you approve the production proof and before production.':'For products without printing, payment is captured no earlier than dispatch.');
 return mixed?'Personligt tilpassede varer betales efter godkendt korrektur. Varer uden tryk betales tidligst ved afsendelse.':'Beløbet reserveres ved bestilling. '+(decorated?'Beløbet hæves efter din godkendelse af produktionskorrekturen og før produktion.':'For varer uden tryk hæves beløbet tidligst ved afsendelse.');
}
export function freightEstimate(fulfillment,config){
 if(!fulfillment?.ready||!fulfillment.groups?.length)return null;
 const amounts=fulfillment.groups.map(group=>group.kind==='blank'?config.blankShipping?.freightExVat:(config.freightByLocation?.[group.location]??(fulfillment.groups.length===1?config.freightExVat:null)));
 if(amounts.some(value=>!Number.isFinite(value)||value<=0))return null;
 const exVat=amounts.reduce((sum,value)=>sum+value,0);return {exVat,incVat:exVat+Math.round(exVat*.25)};
}
