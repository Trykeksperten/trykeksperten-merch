import {loadArtworkPreview} from './artwork-preview.mjs';
import {loadFile as loadOriginalArtwork} from './storage.mjs';
import {translate} from './i18n-core.mjs';
import {placementOptionAssets} from './pf-rules.mjs?v=2';
import {artworkPrintSize,textPrintSize,optionPrintSize,printableBounds,containMappedBounds,proportionalPrintBounds} from './design-layers.mjs?v=8';
import {drawTextPreview} from './text-preview.mjs';
import {decorationPreviewColor} from './decoration-preview.mjs';
import {recolorArtworkPreview,tintArtworkPreview} from './vector-preview.mjs?v=2';

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
export async function renderCartMockup(product,option,design,{loadPreview=loadArtworkPreview,variant,allowEPSPlaceholder=false,loadOriginal}={}){
 const assets=placementOptionAssets(product,option);
 if(!assets.ready)throw Error('Der mangler et placeringsbillede.');
 const image=await loadImage(assets.svg?'/api/pf-placement-art?src='+encodeURIComponent(assets.svg):'/api/pf-imprint-image?src='+encodeURIComponent(assets.image));
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
 const zone=proportionalPrintBounds(containMappedBounds(bounds,image.naturalWidth,image.naturalHeight,1024,1024),option,1024,1024),print=optionPrintSize(option);
 const place=(placement,draw)=>{
  ctx.save();ctx.translate((zone.x+zone.width*placement.x)*1024,(zone.y+zone.height*placement.y)*1024);
  ctx.scale(zone.width*1024/print.width,zone.height*1024/print.height);
  ctx.rotate((placement.rotation||0)*Math.PI/180);draw();ctx.restore();
 };
 const previewColor=decorationPreviewColor(option,{foil:design.foilFinish,productHex:variant?.hex});
 const artworks=design.artworks?.length?design.artworks:design.logo?[{logo:design.logo,x:.5,y:.5,scale:.34}]:[];
 let incomplete=false;
 for(const art of artworks){
  const file=await loadPreview(art.logo);
  if(!file){
   // Only customer previews may substitute a clearly labelled EPS placeholder.
   // Missing originals and failed PDF/AI previews must still fail closed.
   if(!allowEPSPlaceholder||art.logo?.type!=='application/postscript'||!(/\.eps$/i.test(art.logo?.name||'')))throw Error('Logofilen kan ikke vises som skitse.');
   const original=await (loadOriginal||loadOriginalArtwork)(art.logo.id);
   if(!original||new TextDecoder().decode(await original.slice(0,4).arrayBuffer())!=='%!PS')throw Error('Logofilen mangler eller er ugyldig.');
   const size=artworkPrintSize(art,option);
   place(art,()=>{
    ctx.fillStyle='rgba(255, 240, 205, 0.85)';ctx.fillRect(-size.widthMm/2,-size.heightMm/2,size.widthMm,size.heightMm);
    ctx.strokeStyle='#8a4700';ctx.lineWidth=.5;ctx.setLineDash([2,1]);ctx.strokeRect(-size.widthMm/2,-size.heightMm/2,size.widthMm,size.heightMm);
    ctx.fillStyle='#633300';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${Math.min(12,size.widthMm/4,size.heightMm/3)}px Arial`;ctx.fillText('EPS',0,0);
   });
   incomplete=true;continue;
  }
  let url;
  try{
   url=previewColor?await tintArtworkPreview(file,previewColor):art.paletteColors?.length&&art.logo.recolorable?await recolorArtworkPreview(file,art.paletteColors):art.color&&art.logo.recolorable?await tintArtworkPreview(file,art.color):null;
   url ||= URL.createObjectURL(file);
   const logo=await loadImage(url),size=artworkPrintSize(art,option);
   place(art,()=>ctx.drawImage(logo,-size.widthMm/2,-size.heightMm/2,size.widthMm,size.heightMm));
  }finally{if(url)URL.revokeObjectURL(url);}
 }
 if(design.text?.trim()){
  await document.fonts.ready;
  const placement={x:.5,y:.5,scale:.24,...design.textPlacement},size=textPrintSize(design.text,placement,option);
  place(placement,()=>drawTextPreview(ctx,design.text,placement,size,previewColor||design.ink||'#17201f'));
 }
 if(incomplete){
  const warning='Ufuldstændig forhåndsvisning: EPS kræver manuel filkontrol.';
  ctx.save();ctx.fillStyle='#fff0cd';ctx.fillRect(0,934,1024,90);ctx.fillStyle='#633300';ctx.textAlign='left';ctx.textBaseline='top';
  ctx.font='bold 26px Arial';ctx.fillText(translate('Ufuldstændig forhåndsvisning'),24,947);
  ctx.font='22px Arial';ctx.fillText(translate('EPS vises som pladsholder og kræver manuel filkontrol.'),24,983);ctx.restore();
  canvas.setAttribute('data-preview-warning',warning);
 }
 canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Dit design · '+option.impLocation+' · '+option.impMethod);
 if(incomplete)canvas.setAttribute('aria-label',canvas.getAttribute('aria-label')+' · '+canvas.getAttribute('data-preview-warning'));
 return canvas;
}
export function bindCartMockups(root,lines){
 const lightbox=document.createElement('dialog');
 lightbox.className='pf-mockup-lightbox';
 lightbox.innerHTML='<div class="pf-mockup-lightbox-content"><button type="button" class="pf-mockup-close" aria-label="Luk stort mockup">×</button><img alt=""><p></p></div>';
 root.append(lightbox);
 root.addEventListener('click',event=>{
  const trigger=event.target.closest('[data-pf-expand-mockup]');
  if(!trigger||!root.contains(trigger))return;
  const image=trigger.querySelector('img');
  lightbox.querySelector('img').src=image.src;
  lightbox.querySelector('img').alt=image.alt;
  lightbox.querySelector('p').textContent=trigger.dataset.caption;
  lightbox.showModal();
 });
 lightbox.addEventListener('click',event=>{if(event.target===lightbox||event.target.closest('.pf-mockup-close'))lightbox.close();});
 for(const line of lines){
  if(!line.decorations?.length)continue;
  const target=[...root.querySelectorAll('[data-pf-mockup]')].find(el=>el.dataset.pfMockup===line.id);
  if(!target)continue;
  target.replaceChildren();
  if(line.companyTemplate){
   for(const [index,design]of line.decorations.entries()){
    const figure=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');
    image.src=`/api/company/previews/${encodeURIComponent(line.companyTemplate.id)}/${index}`;image.alt=`Fast design · ${design.position||'Tryk'}`;image.loading='lazy';caption.textContent=design.position||'Virksomhedens design';
    image.onerror=()=>{image.remove();caption.textContent='Log ind på virksomhedssiden for at se designet.';};figure.append(image,caption);target.append(figure);
   }
   continue;
  }
  for(const design of line.decorations){
   const figure=document.createElement('figure'),caption=document.createElement('figcaption');
   caption.textContent='Indlæser dit mockup…';figure.append(caption);target.append(figure);
   (async()=>{
    try{
     const product=await productDetail(line.productId),variant=product.variants.find(v=>v.sku===line.sku),option=variant?.options.find(o=>o.id===design.optionId);
     if(!option)throw Error('Placeringen findes ikke længere.');
     const canvas=await renderCartMockup(product,option,design,{variant,allowEPSPlaceholder:true});
     if(!target.isConnected)return;
     const warning=canvas.getAttribute('data-preview-warning');
     const image=document.createElement('img'),button=document.createElement('button'),captionText=option.impLocation+' · Dit design'+(warning?' · '+warning:'');
     image.src=canvas.toDataURL('image/png');image.alt=`Mockup af ${product.name}, ${option.impLocation}`;
     if(warning)image.alt+=' · '+warning;
     if(warning)caption.setAttribute('data-preview-warning',warning);
     button.type='button';button.className='pf-mockup-expand';button.dataset.pfExpandMockup='';button.dataset.caption=captionText;button.setAttribute('aria-label',`Forstør mockup: ${captionText}`);
     button.append(image);button.insertAdjacentHTML('beforeend','<span class="pf-mockup-plus" aria-hidden="true">+</span>');
     figure.prepend(button);caption.textContent=warning?'EPS · Se advarsel':captionText;
     if(warning)caption.title=warning;
    }catch(error){if(target.isConnected)caption.textContent=(design.position?design.position+': ':'')+(error.message||'Mockuppet kunne ikke vises.')+' Åbn designet for at se eller rette det.';}
   })();
  }
 }
}

// Mail previews are bounded independently of the full-size cart canvas.
export function mailMockupBase64(canvas){
 if(canvas.getAttribute?.('data-preview-warning'))throw Error('En ufuldstændig forhåndsvisning må ikke bruges som ordremockup.');
 const preview=document.createElement('canvas');
 const scale=Math.min(1,512/Math.max(canvas.width,canvas.height));
 preview.width=Math.max(1,Math.round(canvas.width*scale));
 preview.height=Math.max(1,Math.round(canvas.height*scale));
 preview.getContext('2d').drawImage(canvas,0,0,preview.width,preview.height);
 return preview.toDataURL('image/png').split(',')[1];
}
