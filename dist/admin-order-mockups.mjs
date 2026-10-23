import {renderCartMockup,mailMockupBase64} from './cart-mockup.mjs?v=2';
import {createVectorPreview} from './vector-preview.mjs?v=2';
const status=document.querySelector('#status'),save=document.querySelector('#save'),previews=document.querySelector('#previews');
const id=new URLSearchParams(location.search).get('order');
async function api(path,options){const r=await fetch(path,options);if(!r.ok){const e=await r.json();throw Error(e.error||'Kunne ikke hente ordre.');}return r;}
try{
 if(!/^pay-[a-f0-9-]{36}$/.test(id||''))throw Error('Ugyldigt ordrenummer.');
 const source=await (await api(`/api/admin/checkouts/${id}/mockups`)).json(),mockups=[];
 const loadPreview=async logo=>{const r=await api(`/api/admin/checkouts/${id}/artwork/${encodeURIComponent(logo.id)}`),blob=await r.blob();return await createVectorPreview(new File([blob],logo.name||logo.filename||"artwork.ai",{type:blob.type}));};
 for(const [lineIndex,line] of source.lines.entries()){
  const product=source.catalog.products.find(p=>p.id===line.productId),variant=product.variants.find(v=>v.sku===line.sku);
  for(const [decorationIndex,design] of line.decorations.entries()){
   status.textContent='Genskaber mockup…';
   const canvas=await renderCartMockup(product,variant.options.find(o=>o.id===design.optionId),design,{loadPreview});
   const base64=mailMockupBase64(canvas);
   canvas.style.cssText='max-width:360px;width:100%;height:auto';previews.append(canvas);
   mockups.push({lineIndex,decorationIndex,base64});
  }
 }
 status.textContent=`${mockups.length} mockup genskabt. ${source.saved?'Ordren har allerede gemte billeder.':'Kontrollér billedet før du gemmer.'}`;
 save.hidden=!!source.saved||!mockups.length;
 save.onclick=async()=>{save.disabled=true;try{await api(`/api/admin/checkouts/${id}/mockups`,{method:'POST',headers:{'Content-Type':'application/json','X-Smerch-Admin':'1'},body:JSON.stringify({mockups})});status.textContent='Mockup gemt på eksisterende ordre. Ingen mail sendt.';save.hidden=true;}catch(e){status.textContent=e.message;save.disabled=false;}};
}catch(e){status.textContent=e.message;}
