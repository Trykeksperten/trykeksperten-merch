// Metadata only: the PNG bytes remain behind the authenticated image endpoint.
export function mockupsForPfOrder(checkout,order){
 if(!order?.checkoutId&&(order?.isTest===true||order?.gatewayPayload?.Header?.isTest===true))return (order.lines||[]).flatMap((line,lineIndex)=>(line.decorations||[]).flatMap((design,decorationIndex)=>design.files?.proof?[{lineIndex,decorationIndex,label:[line.productId,design.position].filter(Boolean).join(' · '),url:`/api/pf-orders/${encodeURIComponent(order.id)}/mockup/${lineIndex}/${decorationIndex}`}]:[]));
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
 const link=document.createElement('a');link.href=ref.url;link.target='_blank';link.rel='noopener';link.append(img);img.onerror=()=>{caption.textContent='Mockup kunne ikke indlæses · prøv at åbne billedet';};figure.append(link,caption);parent.append(figure);return figure;
}

export function mockupsForCheckout(checkout){
 return (checkout.mockups||[]).filter(ref=>checkout.lines?.[ref.lineIndex]?.decorations?.[ref.decorationIndex]).map(ref=>({...ref,label:[checkout.productNames?.[checkout.lines[ref.lineIndex].productId]||checkout.lines[ref.lineIndex].productId,checkout.lines[ref.lineIndex].decorations[ref.decorationIndex].position].filter(Boolean).join(' · '),url:`/api/admin/checkouts/${encodeURIComponent(checkout.id)}/mockup/${ref.lineIndex}/${ref.decorationIndex}`}));
}
export function appendMockupOverview(parent,refs,{decorated=false}={}){
 const gallery=document.createElement('div');gallery.className='mockup-overview';
 for(const ref of refs)appendMockup(gallery,ref,{compact:true});
 if(!refs.length){const note=document.createElement('span');note.className='muted';note.textContent=decorated?'Mockup mangler':'Uden tryk';gallery.append(note);}
 parent.append(gallery);return gallery;
}
