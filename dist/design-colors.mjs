// Count the colours of the complete placement, including recoloured logos and text.
export function designColorCount(artworks=[],text='',ink='#17201f'){
 const colors=new Set();let unknown=0;
 for(const art of artworks){
  const palette=art.paletteColors?.length?art.paletteColors.map(row=>row.target):art.logo?.detectedPalette?.map(row=>row.hex)||[];
  if(palette.length)for(const color of palette)colors.add(String(color).toLowerCase());
  else unknown=Math.max(unknown,Number(art.logo?.detectedColors)||0);
 }
 if(text.trim())colors.add(ink.toLowerCase());
 return Math.max(colors.size,unknown);
}
export function suggestedColorCount(detected,choices=[]){
 if(!detected)return 1;
 return choices.map(choice=>choice.colors).sort((a,b)=>a-b).find(count=>count>=detected)||detected;
}
