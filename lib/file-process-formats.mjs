import {PDFDocument,PDFName,PDFDict,PDFArray,PDFStream,PDFInvalidObject} from 'pdf-lib';
const fail=code=>{throw Object.assign(Error('Unsafe file.'),{code});};
export async function inspectPDF(bytes,{active=false,maxPages=40}={}){
 const document=await PDFDocument.load(bytes,{ignoreEncryption:false,throwOnInvalidObject:true,updateMetadata:false});
 const pages=document.getPageCount();if(!pages||pages>maxPages)fail('FILE_PAGES');
 if(active){const blocked=new Set(['JavaScript','JS','Launch','EmbeddedFile','EmbeddedFiles','RichMedia','RichMediaContent','RichMediaSettings','SubmitForm','ImportData','GoToR','GoToE','Rendition','Movie','Sound','XFA']);const pending=document.context.enumerateIndirectObjects().map(([,object])=>object),seen=new Set();
  while(pending.length){const object=pending.pop();if(!object||seen.has(object))continue;seen.add(object);if(object instanceof PDFInvalidObject)fail('FILE_PROCESS_FAILED');if(object instanceof PDFName&&blocked.has(object.decodeText()))fail('FILE_ACTIVE');if(object instanceof PDFDict)for(const [key,value] of object.entries())pending.push(key,value);else if(object instanceof PDFArray)pending.push(...object.asArray());else if(object instanceof PDFStream)pending.push(object.dict);}
 }
 return {pages};
}
export async function inspectImage({bytes,mimeType}){
 if(mimeType==='image/png'&&bytes.length>=24){const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);if(!width||!height||width*height>40000000)fail('FILE_PIXELS');}
 if(!['image/png','image/jpeg'].includes(mimeType))fail('FILE_PROCESS_FAILED');
 const doc=await PDFDocument.create(),image=mimeType==='image/png'?await doc.embedPng(bytes):await doc.embedJpg(bytes);if(image.width*image.height>40000000)fail('FILE_PIXELS');return {width:image.width,height:image.height};
}
export async function mergeProofFiles(files){
 const output=await PDFDocument.create();let pages=0;
 for(const file of files){if(file.mimeType==='application/pdf'){const input=await PDFDocument.load(file.bytes,{throwOnInvalidObject:true,ignoreEncryption:false});pages+=input.getPageCount();if(!input.getPageCount()||pages>40)fail('FILE_PAGES');for(const page of await output.copyPages(input,input.getPageIndices()))output.addPage(page);}else{if(++pages>40)fail('FILE_PAGES');await inspectImage(file);const image=file.mimeType==='image/png'?await output.embedPng(file.bytes):await output.embedJpg(file.bytes),scale=Math.min(1,1200/Math.max(image.width,image.height)),page=output.addPage([image.width*scale,image.height*scale]);page.drawImage(image,{x:0,y:0,width:page.getWidth(),height:page.getHeight()});}}
 return Buffer.from(await output.save());
}
