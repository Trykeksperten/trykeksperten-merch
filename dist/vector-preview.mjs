let pdfModulePromise;

// Illustrator's PDF-compatible files can contain a large, empty artboard. Keep
// the original vector file for production and crop only its on-screen preview.
export function visibleArtworkBounds({data,width,height},padding=0){
 if(!width||!height||data.length<width*height*4)return null;
 const isWhite=index=>data[index]>245&&data[index+1]>245&&data[index+2]>245;
 let borderPixels=0,whiteBorderPixels=0,opaqueBorderPixels=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  if(x!==0&&x!==width-1&&y!==0&&y!==height-1)continue;
  const index=(y*width+x)*4;
  borderPixels++;
  if(data[index+3]>245){opaqueBorderPixels++;if(isWhite(index))whiteBorderPixels++;}
 }
 const whiteBackground=opaqueBorderPixels>borderPixels*.9&&whiteBorderPixels>opaqueBorderPixels*.95;
 let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const index=(y*width+x)*4;
  if(data[index+3]<20||(whiteBackground&&isWhite(index)))continue;
  left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
 }
 if(right<left)return null;
 return {x:Math.max(0,left-padding),y:Math.max(0,top-padding),
  width:Math.min(width-1,right+padding)-Math.max(0,left-padding)+1,
  height:Math.min(height-1,bottom+padding)-Math.max(0,top-padding)+1,
  whiteBackground};
}

export async function tintArtworkPreview(file,color){
 if(!/^#[0-9a-f]{6}$/i.test(color))return null;
 const image=await createImageBitmap(file);
 try{
  const canvas=window.document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const context=canvas.getContext('2d');context.drawImage(image,0,0);
  context.globalCompositeOperation='source-in';context.fillStyle=color;context.fillRect(0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  return blob?URL.createObjectURL(blob):null;
 }finally{image.close?.();}
}

export async function previewHasTransparency(file){
 const image=await createImageBitmap(file);
 try{
  const canvas=window.document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
  for(let i=3;i<pixels.length;i+=4)if(pixels[i]<16)return true;
  return false;
 }finally{image.close?.();}
}

export async function isPdfCompatible(file){
 const bytes=new Uint8Array(await file.slice(0,5).arrayBuffer());
 return String.fromCharCode(...bytes)==='%PDF-';
}

export async function createVectorPreview(file,{maxDimension=1600}={}){
 if(!await isPdfCompatible(file))return null;
 pdfModulePromise??=import('/vendor/pdf.mjs').then(pdf=>{
  pdf.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.mjs';
  return pdf;
 });
 const pdf=await pdfModulePromise,loadingTask=pdf.getDocument({data:await file.arrayBuffer()}),pdfDocument=await loadingTask.promise;
 try{
  const page=await pdfDocument.getPage(1),base=page.getViewport({scale:1}),scale=Math.min(3,maxDimension/Math.max(base.width,base.height)),viewport=page.getViewport({scale});
  const canvas=window.document.createElement('canvas');canvas.width=Math.max(1,Math.round(viewport.width));canvas.height=Math.max(1,Math.round(viewport.height));
  const context=canvas.getContext('2d',{alpha:true,willReadFrequently:true});
  await page.render({canvasContext:context,viewport,background:'rgba(255,255,255,0)'}).promise;
  const bounds=visibleArtworkBounds(context.getImageData(0,0,canvas.width,canvas.height),Math.max(2,Math.round(Math.min(canvas.width,canvas.height)*.015)));
  let preview=canvas;
  if(bounds&&(bounds.width<canvas.width||bounds.height<canvas.height)){
   preview=window.document.createElement('canvas');preview.width=bounds.width;preview.height=bounds.height;
   const previewContext=preview.getContext('2d',{willReadFrequently:true});
   previewContext.drawImage(canvas,bounds.x,bounds.y,bounds.width,bounds.height,0,0,bounds.width,bounds.height);
   if(bounds.whiteBackground){
    const pixels=previewContext.getImageData(0,0,bounds.width,bounds.height);
    for(let i=0;i<pixels.data.length;i+=4){
     const light=Math.min(pixels.data[i],pixels.data[i+1],pixels.data[i+2]);
     const range=Math.max(pixels.data[i],pixels.data[i+1],pixels.data[i+2])-light;
     if(light>245&&range<10)pixels.data[i+3]=0;
    }
    previewContext.putImageData(pixels,0,0);
   }
  }
  const blob=await new Promise(resolve=>preview.toBlob(resolve,'image/png'));
  if(!blob)throw Error('Der kunne ikke oprettes en forhåndsvisning af vektorfilen.');
  return new File([blob],file.name.replace(/\.[^.]+$/, '')+'-preview.png',{type:'image/png'});
 }finally{await loadingTask.destroy();}
}
