// Preview recolouring does not modify the uploaded production file.
export function artworkColorChanges(art){
 const palette=art.paletteColors||[];
 if(palette.length)return palette.filter(row=>String(row.source).toLowerCase()!==String(row.target).toLowerCase());
 if(art.color)return [{source:'original',target:art.color}];
 return [];
}
export function assertProductionColors(decoration){
 if((decoration.artworks||[]).some(art=>artworkColorChanges(art).length)){
  throw Error(`Farven er ændret i designstudiet for ${decoration.position||'en trykplacering'}, men originalfilen har stadig sine oprindelige farver. PF-afsendelse er blokeret, indtil en produktionsfil med de ønskede farver er uploadet uden yderligere farveændring i studiet.`);
 }
}
