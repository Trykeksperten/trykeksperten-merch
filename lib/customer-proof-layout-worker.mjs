import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {dirname,resolve,sep} from 'node:path';
import {PDFDocument} from 'pdf-lib';
const require=createRequire(import.meta.url),scale=3,maxPixels=16000000,maxTotalPixels=120000000,maxBytes=24*1024*1024;
const normalize=s=>String(s).replace(/\s/g,'').toLowerCase();
// Locate every occurrence, including a reference split across text objects.
function matchingItems(items,needle){
 let text='',owners=[];
 for(let i=0;i<items.length;i++)for(const char of normalize(items[i].str)){text+=char;owners.push(i);}
 const found=new Set();let from=0,at;
 while((at=text.indexOf(needle,from))!==-1){for(let p=at;p<at+needle.length;p++)found.add(owners[p]);from=at+needle.length;}
 return found;
}
// Work in PDF coordinates and then apply the same crop/rotation as the renderer.
function polygon(item,styles,viewport){
 const [a,b,c,d,x,y]=item.transform,along=Math.hypot(a,b),height=Math.hypot(c,d)||item.height;
 if(!along||!height||!Number.isFinite(item.width))throw Error('Invalid text geometry');
 const ux=a/along,uy=b/along,vx=c/height,vy=d/height,font=styles[item.fontName]||{},ascent=font.ascent??.9,descent=font.descent??-.25,pad=1;
 return [[-pad,descent*height-pad],[item.width+pad,descent*height-pad],[item.width+pad,ascent*height+pad],[-pad,ascent*height+pad]].map(([u,v])=>viewport.convertToViewportPoint(x+ux*u+vx*v,y+uy*u+vy*v));
}
try{
 const {createCanvas}=require('@napi-rs/canvas');
 const {getDocument,AnnotationMode}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const root=dirname(require.resolve('pdfjs-dist/package.json'));
 const task=getDocument({data:new Uint8Array(workerData.bytes),isEvalSupported:false,enableXfa:false,useSystemFonts:false,disableFontFace:true,standardFontDataUrl:resolve(root,'standard_fonts')+sep,cMapUrl:resolve(root,'cmaps')+sep,cMapPacked:true,wasmUrl:resolve(root,'wasm')+sep});
 try{
  const source=await task.promise;
  if(source.numPages>40)throw Error('Too many pages');
  const output=await PDFDocument.create();output.setTitle('Korrektur · Smerch');output.setAuthor('Smerch');
  let pixels=0,bytes=0;
  const needle=normalize(workerData.reference);if(!needle)throw Error('Missing reference');
  for(let n=1;n<=source.numPages;n++){
   const page=await source.getPage(n),content=await page.getTextContent(),items=content.items.filter(i=>i.str&&i.transform),redact=matchingItems(items,needle),labels=matchingItems(items,'customerreference');
   // An unknown reference layout must never fall back to the supplier original.
   if(!items.length)throw Error('Image-only page cannot be checked');
   if(labels.size&&!redact.size)throw Error('Reference label without matching order reference');
   // Refuse a merged text object if erasing it would remove unrelated proof data.
   const text=[...new Set([...redact,...labels])].sort((a,b)=>a-b).map(i=>normalize(items[i].str)).join('').replaceAll(needle,'').replaceAll('customerreference','').replace(/[:：]/g,'');
   if(text)throw Error('Reference shares a text object with other proof details');
   for(const i of labels)redact.add(i);
   const company=matchingItems(items,'trykekspertenaps');
   const companyText=[...company].sort((a,b)=>a-b).map(i=>normalize(items[i].str)).join('').replaceAll('trykekspertenaps','');
   if(companyText)throw Error('Company name shares a text object with other proof details');
   for(const i of company)redact.add(i);
   const viewport=page.getViewport({scale}),size=page.getViewport({scale:1}),width=Math.ceil(viewport.width),height=Math.ceil(viewport.height),area=width*height;
   pixels+=area;if(area>maxPixels||pixels>maxTotalPixels)throw Error('Page pixel limit exceeded');
   const canvas=createCanvas(width,height),context=canvas.getContext('2d');
   try{
    await page.render({canvasContext:context,viewport,background:'rgb(255,255,255)',annotationMode:AnnotationMode.DISABLE}).promise;
    context.fillStyle='#ffffff';
    for(const i of redact){const points=polygon(items[i],content.styles,viewport);context.beginPath();context.moveTo(...points[0]);for(const point of points.slice(1))context.lineTo(...point);context.closePath();context.fill();}
    const png=canvas.toBuffer('image/png');bytes+=png.length;if(bytes>maxBytes)throw Error('Customer copy size limit exceeded');
    const image=await output.embedPng(png),target=output.addPage([size.width,size.height]);target.drawImage(image,{x:0,y:0,width:size.width,height:size.height});
   }finally{canvas.width=canvas.height=1;page.cleanup();}
  }
  // Fresh image-only PDF: no original text streams, metadata, links or attachments.
  const data=await output.save();if(data.length>maxBytes)throw Error('Customer copy size limit exceeded');parentPort.postMessage({data},[data.buffer]);
 }finally{await task.destroy();}
}catch{parentPort.postMessage({error:true});}
