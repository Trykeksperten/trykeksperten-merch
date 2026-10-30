import {renderTestColourChoice} from './pf-test-colours.mjs';
import {renderCartMockup,mailMockupBase64} from './cart-mockup.mjs?v=9';
import {readCart} from './pf-cart.mjs';
import {loadFile} from './storage.mjs';
import {artworkColorChanges,assertProductionColors} from './artwork-production-colors.mjs';
const $=id=>document.getElementById(id);
const node=(tag,text)=>{const result=document.createElement(tag);if(text)result.textContent=text;return result;};
export function bindCartTest(){
 let snapshot=null,requestId=null,cartVersion=null;
 const preview=$('test-cart-preview'),panel=$('test-cart-panel');
 const load=()=>{
  snapshot=structuredClone(readCart());cartVersion=JSON.stringify(snapshot);requestId=crypto.randomUUID();preview.replaceChildren();
  if(!snapshot.length){preview.append(node('p','Kurven er tom. Tilføj et produkt med logo på shoppen.'));return;}
  preview.append(node('p',`${snapshot.length} varelinjer · ${snapshot.reduce((sum,line)=>sum+Number(line.quantity),0)} stk. Kurven bliver ikke tømt ved test.`));
  snapshot.forEach((line,i)=>{
   const section=node('section');section.append(node('h3',`${line.quantity} × ${line.sku}`));
   if(!line.decorations?.length)section.append(node('p','Uden tryk — fjern denne vare fra kurven før logotesten.'));
   (line.decorations||[]).forEach((decoration,j)=>{
    section.append(node('p',`${decoration.position} · ${decoration.method} · ${decoration.width} × ${decoration.height} mm`));
    section.append(node('p',(decoration.artworks||[]).map(art=>art.logo.name).join(', ')||'Tekst uden logofil'));
    for(const art of decoration.artworks||[]){const changes=artworkColorChanges(art);if(changes.length){const warning=node('p',`${art.logo.name}: Valgt farveændring ${changes.map(row=>`${row.source} → ${row.target}`).join(', ')}. Originalfilen er uændret. Afsendelse er blokeret, indtil produktionsfilen matcher designet.`);warning.className='error';section.append(warning);const reset=node('button','Brug originalfarver til testen');reset.type='button';reset.onclick=()=>{delete art.color;delete art.paletteColors;requestId=crypto.randomUUID();warning.className='muted';warning.textContent='Testen bruger originalfilens farver. Mockuppet laves med de samme farver. Din kurv er uændret.';reset.remove();renderTestColourChoice(colourChoice,decoration,input);};section.append(reset);}}
    const label=node('label',`PF-farvekoder (${decoration.colors} farve${decoration.colors===1?'':'r'}, adskilt med komma)`),input=node('input');input.dataset.testColour=`${i}:${j}`;input.placeholder='Fx Black C';input.required=true;const colourChoice=node('div');renderTestColourChoice(colourChoice,decoration,input);label.append(input);section.append(colourChoice,label);
   });preview.append(section);
  });
 };
 $('test-source').onchange=()=>{panel.hidden=$('test-source').value!=='cart';if(!panel.hidden&&!snapshot)load();for(const input of preview.querySelectorAll('input'))input.disabled=panel.hidden;};
 $('test-load-cart').onclick=load;
 return {async payload(shipping){
  if(!snapshot?.length)throw Error('Indlæs en kurv med logoer først.');
  if(cartVersion!==JSON.stringify(readCart()))throw Error('Kurven er ændret. Tryk Indlæs min kurv og kontrollér den igen.');
  for(const line of snapshot)for(const decoration of line.decorations||[])assertProductionColors(decoration);
  const colours={};for(const input of preview.querySelectorAll('input[data-test-colour]')){if(input.dataset.pendingConfirmation)throw Error('Bekræft de viste Pantone-farvekoder før afsendelse.');colours[input.dataset.testColour]=input.value.split(',').map(value=>value.trim()).filter(Boolean);}
  const ids=[...new Set(snapshot.flatMap(line=>(line.decorations||[]).flatMap(deco=>(deco.artworks||[]).map(art=>art.logo.id))))],artworks=[];let total=0;
  for(const id of ids){const blob=await loadFile(id);if(!blob)throw Error('En originalfil mangler i browseren. Åbn designet og upload filen igen.');total+=blob.size;if(total>20*1024*1024)throw Error('Originalfilerne må samlet højst fylde 20 MB.');const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));artworks.push({id,base64:btoa(binary)});}
  const mockups=[];
  for(const [lineIndex,line] of snapshot.entries()){
   const response=await fetch('/api/pf-product/'+encodeURIComponent(line.productId));if(!response.ok)throw Error('Produktet kunne ikke indlæses til mockup.');
   const product=await response.json(),variant=product.variants.find(v=>v.sku===line.sku);
   for(const [decorationIndex,design] of (line.decorations||[]).entries()){
    const option=variant?.options.find(o=>o.id===design.optionId);if(!option)throw Error('Trykplaceringen mangler til mockuppet.');
    const base64=mailMockupBase64(await renderCartMockup(product,option,design,{variant}));
    if(base64.length>2*1024*1024||mockups.reduce((n,m)=>n+m.base64.length,0)+base64.length>8*1024*1024)throw Error('Mockups er for store. Test færre placeringer ad gangen.');
    mockups.push({lineIndex,decorationIndex,base64});
   }
  }
  if(cartVersion!==JSON.stringify(readCart()))throw Error('Kurven er ændret. Indlæs den igen før testen.');
  return {requestId,mockups,confirmation:'TEST',lines:snapshot,shipping,colours,artworks};
 }};
}
