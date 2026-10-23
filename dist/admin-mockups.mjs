// Metadata only: the PNG bytes remain behind the authenticated image endpoint.
export function mockupsForPfOrder(checkout,order){
 if(!checkout||!order?.checkoutId||checkout.id!==order.checkoutId)return [];
 const index=Number.isInteger(order.checkoutGroupIndex)?order.checkoutGroupIndex:(checkout.pfOrderIds||[]).indexOf(order.id);
 const lineIndexes=checkout.fulfillmentGroups?.[index]??(checkout.pfOrderIds?.length===1?checkout.lines.map((_,i)=>i):[]);
 return (checkout.mockups||[]).filter(ref=>lineIndexes.includes(ref.lineIndex)&&checkout.lines?.[ref.lineIndex]?.decorations?.[ref.decorationIndex]).map(ref=>({...ref,
  label:[checkout.lines[ref.lineIndex].productId,checkout.lines[ref.lineIndex].decorations[ref.decorationIndex].position].filter(Boolean).join(' · '),
  url:`/api/admin/checkouts/${encodeURIComponent(checkout.id)}/mockup/${ref.lineIndex}/${ref.decorationIndex}`
 }));
}
export function appendMockup(parent,ref,{compact=false}={}){
 const figure=document.createElement('figure');figure.className=compact?'admin-mockup compact':'admin-mockup';
 const img=document.createElement('img');img.src=ref.url;img.alt=`Designmockup · ${ref.label||'trykplacering'}`;img.loading='lazy';
 const caption=document.createElement('figcaption');caption.textContent=ref.label||'Designmockup';
 figure.append(img,caption);parent.append(figure);return figure;
}
