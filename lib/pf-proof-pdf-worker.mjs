import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {dirname,resolve,sep} from 'node:path';
const require=createRequire(import.meta.url);
try{
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=getDocument({data:new Uint8Array(workerData),isEvalSupported:false,enableXfa:false,useSystemFonts:false,disableFontFace:true,standardFontDataUrl:resolve(dirname(require.resolve('pdfjs-dist/package.json')),'standard_fonts')+sep});
 const pdf=await task.promise;
 try{if(pdf.numPages<1||pdf.numPages>40)throw Error('Korrekturen skal indeholde 1–40 sider.');const pages=[];for(let n=1;n<=pdf.numPages;n++){const page=await pdf.getPage(n),text=await page.getTextContent();pages.push(text.items.map(item=>item.str||'').join(' '));page.cleanup();}parentPort.postMessage({text:pages.join('\n')});}finally{await task.destroy();}
}catch{parentPort.postMessage({error:'PDF-korrekturen kunne ikke læses sikkert.'});}
