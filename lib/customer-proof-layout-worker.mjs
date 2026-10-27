import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {dirname,resolve,sep} from 'node:path';
const require=createRequire(import.meta.url);
try{
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=getDocument({data:new Uint8Array(workerData.bytes),isEvalSupported:false,enableXfa:false,useSystemFonts:false,disableFontFace:true,standardFontDataUrl:resolve(dirname(require.resolve('pdfjs-dist/package.json')),'standard_fonts')+sep});
 try{
  const pdf=await task.promise,boxes=[];
  if(pdf.numPages>40)throw Error('Too many pages');
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdf.getPage(n),content=await page.getTextContent(),items=content.items.filter(i=>i.str&&i.transform);
   const value=items.find(i=>i.str.includes(workerData.reference));
   const label=items.find(i=>/Customer Reference/i.test(i.str)&&value&&Math.abs(i.transform[5]-value.transform[5])<3);
   // Only the known PF reference row is masked; never guess a location.
   if(value&&label&&page.rotate===0){
    const group=items.filter(i=>Math.abs(i.transform[5]-value.transform[5])<3&&i.transform[4]>=label.transform[4]-1&&i.transform[4]<=value.transform[4]+value.width+1);
    const x=Math.min(...group.map(i=>i.transform[4])),y=Math.min(...group.map(i=>i.transform[5]));
    boxes.push({page:n-1,x:x-1,y:y-2,width:Math.max(...group.map(i=>i.transform[4]+i.width))-x+2,height:Math.max(...group.map(i=>i.height))+4});
   }
   page.cleanup();
  }
  parentPort.postMessage({boxes});
 }finally{await task.destroy();}
}catch{parentPort.postMessage({boxes:[]});}
