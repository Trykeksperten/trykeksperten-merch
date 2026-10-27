import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,StandardFonts,PDFName,PDFString,degrees} from 'pdf-lib';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {customerProofView} from '../lib/customer-proof-view.mjs';
import {createCanvas} from '@napi-rs/canvas';
const reference='SMERCH-demo';
async function fixture({split=false,rotate=0,pages=1,embedded=false,merged=false,companySplit=false}={}){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);pdf.setTitle(reference);pdf.setSubject('Customer Reference '+reference);
 for(let i=0;i<pages;i++){
  const p=pdf.addPage([595,842]);if(rotate)p.setRotation(degrees(rotate));
  for(const [text,x,y] of [['Order Number',40,780],['7886901',200,780],...(companySplit?[['Trykeksperten',360,780],['ApS',418,780]]:[['Trykeksperten ApS',360,780]]),...(merged?[[`Customer Reference: ${reference}`,40,760]]:[['Customer Reference',40,760],...(split?[['SMERCH-',200,760],['demo',242,760]]:[[reference,200,760]])]),['Article',40,740],['Cap',200,740]])p.drawText(text,{x,y,font,size:9});
  const a=pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[10,10,100,30],Contents:PDFString.of(reference),A:{S:'URI',URI:PDFString.of('https://example.test/'+reference)}}));p.node.addAnnot(a);
 }
 if(embedded)await pdf.attach(Buffer.from(reference),'internal.txt',{description:reference});
 return {mimeType:'application/pdf',data:Buffer.from(await pdf.save())};
}
async function inspect(bytes){const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false});try{const pdf=await task.promise,text=[];for(let i=1;i<=pdf.numPages;i++)text.push((await(await pdf.getPage(i)).getTextContent()).items.map(i=>i.str||'').join(' '));return {text:text.join('\n'),metadata:await pdf.getMetadata()};}finally{await task.destroy();}}
async function render(bytes){const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false});try{const page=await(await task.promise).getPage(1),viewport=page.getViewport({scale:1}),canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),context=canvas.getContext('2d');await page.render({canvasContext:context,viewport,background:'rgb(255,255,255)'}).promise;return {context,width:canvas.width,height:canvas.height};}finally{await task.destroy();}}
const darkPixels=(image,x,y,w,h)=>{const data=image.context.getImageData(x,y,w,h).data;let total=0;for(let i=0;i<data.length;i+=4)if(data[i]<180&&data[i+1]<180&&data[i+2]<180)total++;return total;};
test('customer PDF contains no source text, metadata, annotations or attachments; original and geometry stay intact',async()=>{
 const proof=await fixture({embedded:true}),original=Buffer.from(proof.data),result=await customerProofView(proof,reference);
 assert.notDeepEqual(result.data,original);assert.deepEqual(proof.data,original);
 const source=await PDFDocument.load(original),customer=await PDFDocument.load(result.data);
 assert.deepEqual(customer.getPage(0).getSize(),source.getPage(0).getSize());assert.equal(customer.getPageCount(),source.getPageCount());
 assert.equal(customer.getPage(0).node.Annots()?.size()||0,0);assert.equal(customer.catalog.has(PDFName.of('Names')),false);assert.equal(customer.catalog.has(PDFName.of('AcroForm')),false);
 const content=await inspect(result.data);assert.equal(content.text.trim(),'');assert.ok(!JSON.stringify(content.metadata).includes(reference));assert.ok((await inspect(original)).text.includes(reference));
 assert.deepEqual((await customerProofView(proof,reference)).data,result.data);
 const before=await render(original),after=await render(result.data);
 assert.ok(darkPixels(before,35,70,280,18)>100);assert.equal(darkPixels(after,35,70,280,18),0);
 assert.ok(darkPixels(before,355,50,140,17)>50,'source company name exists');assert.equal(darkPixels(after,355,50,140,17),0,'company name removed');assert.ok(darkPixels(after,35,50,280,17)>100,'order number retained');assert.ok(darkPixels(after,35,90,280,17)>30,'article retained');
});
test('split, merged and repeated references are removed from every page',async()=>{
 for(const options of [{split:true,pages:2,companySplit:true},{merged:true,pages:2}]){
  const proof=await fixture(options),result=await customerProofView(proof,reference),pdf=await PDFDocument.load(result.data);assert.equal(pdf.getPageCount(),2);assert.equal((await inspect(result.data)).text.trim(),'');
  const image=await render(result.data);assert.equal(darkPixels(image,35,70,280,18),0);assert.equal(darkPixels(image,355,50,140,17),0);assert.ok(darkPixels(image,35,50,280,17)>100);
 }
});
test('rotated pages preserve the displayed geometry and remove the reference',async()=>{
 const proof=await fixture({rotate:90}),result=await customerProofView(proof,reference),customer=await PDFDocument.load(result.data);
 assert.deepEqual(customer.getPage(0).getSize(),{width:842,height:595});assert.equal((await inspect(result.data)).text.trim(),'');
 const before=await render(proof.data),after=await render(result.data);assert.deepEqual([after.width,after.height],[before.width,before.height]);
 // Original PDF position (40,760) becomes (760,40) under a 90-degree viewport.
 assert.equal(darkPixels(after,747,35,27,280),0);assert.ok(darkPixels(before,747,35,27,280)>100);
});
test('unsafe or unreadable layouts fail closed instead of returning supplier bytes',async()=>{
 const proof=await fixture();await assert.rejects(customerProofView(proof,'SMERCH-unrelated'),/klargøres sikkert/);await assert.rejects(customerProofView(proof,''),/klargøres sikkert/);
 await assert.rejects(customerProofView({mimeType:'application/pdf',data:Buffer.from('%PDF-broken')},reference),/klargøres sikkert/);
 const pdf=await PDFDocument.create();pdf.addPage([500,500]);await assert.rejects(customerProofView({mimeType:'application/pdf',data:Buffer.from(await pdf.save())},reference),/klargøres sikkert/);
 const giant=await PDFDocument.create(),p=giant.addPage([10000,10000]),font=await giant.embedFont(StandardFonts.Helvetica);p.drawText('Proof',{font,x:40,y:40});await assert.rejects(customerProofView({mimeType:'application/pdf',data:Buffer.from(await giant.save())},reference),/klargøres sikkert/);
});
test('PDFs without reference labels are rebuilt; non-PDF artwork is preserved',async()=>{
 const pdf=await PDFDocument.create(),p=pdf.addPage(),font=await pdf.embedFont(StandardFonts.Helvetica);p.drawText('Design preview',{font,x:40,y:740});const proof={mimeType:'application/pdf',data:Buffer.from(await pdf.save())};assert.equal((await inspect((await customerProofView(proof,reference)).data)).text.trim(),'');
 const image={mimeType:'image/png',data:Buffer.from('image')};assert.equal(await customerProofView(image,reference),image);
});
test('concurrent requests use the same sanitized customer copy',async()=>{const proof=await fixture({split:true,rotate:180});const results=await Promise.all(Array.from({length:3},()=>customerProofView(proof,reference)));assert.ok(results.every(r=>r.data.equals(results[0].data)));assert.notDeepEqual(results[0].data,proof.data);});
