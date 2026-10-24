// Amounts are integer øre. The threshold applies to goods, including VAT, excluding freight.
export const privateBlankReviewLimit=500000;
export const privateBlankReviewReason='Privatordre uden tryk over 5.000 kr. inkl. moms (ekskl. fragt). Afventer Smerchs godkendelse før PF.';
export function requiresPFReview(order){
 return order?.legal?.customerType==='consumer'&&Array.isArray(order.lines)&&order.lines.length>0&&order.lines.every(line=>Array.isArray(line.decorations)&&line.decorations.length===0)&&Number.isSafeInteger(order.quote?.totalIncVat)&&order.quote.totalIncVat>privateBlankReviewLimit;
}
