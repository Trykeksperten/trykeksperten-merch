import {loadArtworkPreview} from './artwork-preview.mjs';

export const epsCheckoutMessage='En EPS-fil mangler forhåndsvisning. Onlinebestilling er sat på pause. Åbn designet fra kurven og erstat filen med en PDF eller PDF-kompatibel AI-fil, eller kontakt os om manuel filkontrol. Din kurv og originalfil er bevaret.';

// A labelled customer placeholder is not a complete order mockup. Check the
// same preview source as the strict renderer, including legacy single logos.
// Company templates already use their saved server mockups at checkout.
export async function checkoutArtworkIssue(lines,{loadPreview=loadArtworkPreview}={}){
 const checked=new Set();
 for(const line of lines){
  if(line.companyTemplate)continue;
  for(const design of line.decorations||[]){
   const artworks=design.artworks?.length?design.artworks:design.logo?[{logo:design.logo}]:[];
   for(const {logo} of artworks){
    if(!logo||(logo.type!=='application/postscript'&&!/\.eps$/i.test(logo.name||'')))continue;
    const key=JSON.stringify([logo.id,logo.previewId]);if(checked.has(key))continue;checked.add(key);
    try{if(await loadPreview(logo))continue;}catch{/* A failed conversion must not enable payment. */}
    return epsCheckoutMessage;
   }
  }
 }
 return null;
}
