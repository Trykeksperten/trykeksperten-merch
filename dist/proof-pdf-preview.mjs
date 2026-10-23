// Draw document pages without embedding a browser PDF plugin or executing PDF actions.
export async function renderProofPdf(bytes,container,{loadPDF=()=>import('/vendor/pdf.mjs'),pixelRatio=globalThis.devicePixelRatio||1}={}){
 const pdfjs=await loadPDF();
 pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.mjs';
 const task=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,enableXfa:false,useSystemFonts:true});
 let document;
 try{
  document=await task.promise;
  if(!document.numPages||document.numPages>40)throw Error('Korrekturen skal have 1–40 sider. Kontakt Smerch for en læsbar korrektur.');
  const pages=[];
  for(let n=1;n<=document.numPages;n++){
   const page=await document.getPage(n),base=page.getViewport({scale:1});
   const width=Math.max(280,Math.min(container.clientWidth||800,1200));
   const scale=Math.min(width*Math.min(Math.max(pixelRatio,1),2)/base.width,2200/Math.max(base.width,base.height));
   const viewport=page.getViewport({scale});
   const section=container.ownerDocument.createElement('section');section.className='proof-pdf-page';
   const caption=container.ownerDocument.createElement('p');caption.textContent=`Side ${n} af ${document.numPages}`;
   const canvas=container.ownerDocument.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`Korrektur, side ${n} af ${document.numPages}`);
   const context=canvas.getContext('2d');if(!context)throw Error('Din browser kan ikke vise korrekturen. Prøv en anden browser.');
   await page.render({canvasContext:context,viewport}).promise;
   section.append(caption,canvas);pages.push(section);page.cleanup();
  }
  // Never display an incomplete document as a successful proof preview.
  container.replaceChildren(...pages);
  return {pages:document.numPages};
 }finally{await task.destroy();}
}
