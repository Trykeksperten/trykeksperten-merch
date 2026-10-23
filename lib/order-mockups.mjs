// Customer previews only; never used as production artwork.
export function orderMockups(input,lines){
 if(!Array.isArray(input))return [];
 const result=[];let total=0;
 for(const item of input.slice(0,40)){
  const line=lines[item?.lineIndex],design=line?.decorations?.[item?.decorationIndex];
  if(!design||typeof item.base64!=='string'||item.base64.length>2*1024*1024||!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(item.base64))continue;
  const bytes=Buffer.from(item.base64,'base64');total+=bytes.length;if(total>6*1024*1024)break;
  result.push({filename:`mockup-${item.lineIndex+1}-${item.decorationIndex+1}.png`,base64:item.base64});
 }
 return result;
}

export function requiredOrderMockup(checkout,lineIndex,decorationIndex){
 const filename=`mockup-${lineIndex+1}-${decorationIndex+1}.png`;
 const matches=(checkout.mockups||[]).filter(m=>m.filename===filename);
 if(matches.length!==1||orderMockups([{lineIndex,decorationIndex,base64:matches[0].base64}],checkout.lines).length!==1)
  throw Error('Mockup mangler eller er ugyldigt for trykplaceringen. PF-ordren er ikke sendt.');
 return matches[0];
}
