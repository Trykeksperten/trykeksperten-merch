import {loadFile} from './storage.mjs';
import {placementOptionAssets} from './pf-rules.mjs?v=2';
import {artworkPrintSize,textPrintSize,optionPrintSize,printableBounds,containMappedBounds} from './design-layers.mjs?v=4';
import {fontFamily} from './pf-text.mjs?v=2';
import {foilFinish,isFoilOption} from './foil-options.mjs';
import {createVectorPreview,recolorArtworkPreview,tintArtworkPreview} from './vector-preview.mjs?v=2';

const loadImage=src=>new Promise((resolve,reject)=>{
 const img=new Image();
 const timeout=setTimeout(()=>reject(Error('Mockuppet kunne ikke indlæses.')),15000);
 img.onload=()=>{clearTimeout(timeout);resolve(img);};
 img.onerror=()=>{clearTimeout(timeout);reject(Error('Mockuppet kunne ikke indlæses.'));};
 img.src=src;
});
const products=new Map();
async function productDetail(id){
 if(!products.has(id))products.set(id,fetch('/api/pf-product/'+encodeURIComponent(id)).then(r=>{if(!r.ok)throw Error();return r.json();}).catch(error=>{products.delete(id);throw error;}));
 return products.get(id);
}
export async function renderCartMockup(product,option,design){
 const assets=placementOptionAssets(product,option);
 if(!assets.ready)throw Error('Der mangler et placeringsbillede.');
 const image=await loadImage(assets.svg?'/api/pf-placement-art?src='+encodeURIComponent(assets.svg):assets.image);
 let bounds=printableBounds(option,image.naturalWidth,image.naturalHeight);
 if(assets.svg){
  const response=await fetch('/api/pf-placement?src='+encodeURIComponent(assets.svg));
  if(!response.ok)throw Error('Trykplaceringen kunne ikke indlæses.');
  bounds=await response.json();
 }
 if(bounds.source==='fallback')throw Error('Trykplaceringen kunne ikke indlæses.');
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
 const ctx=canvas.getContext('2d'),scale=Math.min(1024/image.naturalWidth,1024/image.naturalHeight);
 ctx.fillStyle='#fff';ctx.fillRect(0,0,1024,1024);
 ctx.drawImage(image,(1024-image.naturalWidth*scale)/2,(1024-image.naturalHeight*scale)/2,image.naturalWidth*scale,image.naturalHeight*scale);
 const zone=containMappedBounds(bounds,image.naturalWidth,image.naturalHeight,1024,1024),print=optionPrintSize(option);
 const place=(placement,draw)=>{
  ctx.save();ctx.translate((zone.x+zone.width*placement.x)*1024,(zone.y+zone.height*placement.y)*1024);
  ctx.scale(zone.width*1024/print.width,zone.height*1024/print.height);
  ctx.rotate((placement.rotation||0)*Math.PI/180);draw();ctx.restore();
 };
 const foil=isFoilOption(option)?foilFinish(design.foilFinish)?.hex:null;
 const artworks=design.artworks?.length?design.artworks:design.logo?[{logo:design.logo,x:.5,y:.5,scale:.34}]:[];
 for(const art of artworks){
  const original=await loadFile(art.logo.previewId||art.logo.id);
  if(!original)throw Error('Logofilen mangler i denne browser.');
  const file=original.type.startsWith('image/')?original:await createVectorPreview(original);
  if(!file)throw Error('Logofilen kan ikke vises som skitse.');
  let url;
  try{
   url=foil?await tintArtworkPreview(file,foil):art.paletteColors?.length&&art.logo.recolorable?await recolorArtworkPreview(file,art.paletteColors):art.color&&art.logo.recolorable?await tintArtworkPreview(file,art.color):null;
   url ||= URL.createObjectURL(file);
   const logo=await loadImage(url),size=artworkPrintSize(art,option);
   place(art,()=>ctx.drawImage(logo,-size.widthMm/2,-size.heightMm/2,size.widthMm,size.heightMm));
  }finally{if(url)URL.revokeObjectURL(url);}
 }
 if(design.text?.trim()){
  await document.fonts.ready;
  const placement={x:.5,y:.5,scale:.24,lineSpacing:1.25,align:'center',...design.textPlacement},size=textPrintSize(design.text,placement,option),lines=design.text.trim().split(/\r?\n/);
  ctx.font='600 100px '+fontFamily(placement.font);
  const measured=Math.max(1,...lines.map(line=>ctx.measureText(line||' ').width)),spacing=placement.lineSpacing;
  const fontSize=Math.min(size.widthMm*100/measured,size.heightMm/(.82*(1+(lines.length-1)*spacing)));
  place(placement,()=>{
   ctx.font='600 '+fontSize+'px '+fontFamily(placement.font);ctx.fillStyle=foil||design.ink||'#17201f';ctx.textAlign=placement.align;ctx.textBaseline='middle';
   const x=placement.align==='left'?-size.widthMm/2:placement.align==='right'?size.widthMm/2:0;
   lines.forEach((line,i)=>ctx.fillText(line,x,(i-(lines.length-1)/2)*fontSize*.82*spacing));
  });
 }
 canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Dit design · '+option.impLocation+' · '+option.impMethod);
 return canvas;
}
export function bindCartMockups(root,lines){
 for(const line of lines){
  if(!line.decorations?.length)continue;
  const target=[...root.querySelectorAll('[data-pf-mockup]')].find(el=>el.dataset.pfMockup===line.id);
  if(!target)continue;
  target.replaceChildren();
  for(const design of line.decorations){
   const figure=document.createElement('figure'),caption=document.createElement('figcaption');
   caption.textContent='Indlæser dit mockup…';figure.append(caption);target.append(figure);
   (async()=>{
    try{
     const product=await productDetail(line.productId),variant=product.variants.find(v=>v.sku===line.sku),option=variant?.options.find(o=>o.id===design.optionId);
     if(!option)throw Error('Placeringen findes ikke længere.');
     const canvas=await renderCartMockup(product,option,design);
     if(!target.isConnected)return;
     figure.prepend(canvas);caption.textContent=option.impLocation+' · Dit design';
    }catch(error){if(target.isConnected)caption.textContent=(design.position?design.position+': ':'')+(error.message||'Mockuppet kunne ikke vises.')+' Åbn designet for at se eller rette det.';}
   })();
  }
 }
}
