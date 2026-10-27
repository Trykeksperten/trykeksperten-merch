import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,PDFName,PDFString} from 'pdf-lib';
import {renderOrderDocument} from '../lib/order-document-pdf.mjs';
const sample=()=>({type:'shipment',reference:'DEMO-1',date:'2026-10-27',customer:{name:'Demo',contact:'Demo',address:'Faktureringsvej 1',reference:'Indkøb 1'},company:{legalName:'Demo ApS',address:'Eksempelvej 1',cvr:'12345678',email:'demo@example.test'},deliveryAddress:'Leveringsvej 2',shipDate:'2026-10-29',carrier:'GLS',lines:[{description:'Kasket',variant:'Havregryn',quantity:4,net:40000},{description:'Restleverance',quantity:0,net:0}],tracking:'TRACK123 https://example.test/track/123',notes:'Kun testdata'});
test('shipment PDF preserves a clickable tracking destination and leaves the order snapshot intact',async()=>{
 const document=sample(),before=structuredClone(document);
 const pdf=await PDFDocument.load(await renderOrderDocument(document));
 const annotations=pdf.getPage(0).node.Annots();
 assert.equal(annotations.size(),1);
 const annotation=pdf.context.lookup(annotations.get(0));
 assert.equal(annotation.lookup(PDFName.of('A')).lookup(PDFName.of('URI'),PDFString).decodeText(),'https://example.test/track/123');
 assert.deepEqual(document,before);
});
test('long shipment tracking continues across pages with all links retained',async()=>{
 const document=sample();document.tracking=Array.from({length:80},(_,i)=>'TRACK'+i+' https://example.test/track/'+i).join('\n');
 const pdf=await PDFDocument.load(await renderOrderDocument(document));
 assert.ok(pdf.getPageCount()>1);
 assert.equal(pdf.getPages().reduce((n,p)=>n+(p.node.Annots()?.size()||0),0),80);
});
