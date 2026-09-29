import test from 'node:test';
import assert from 'node:assert/strict';
import {documentCandidates,listProductDocuments} from '../lib/pf-documents.mjs';
import {productDocumentMetadata} from '../lib/pf-document-metadata.mjs';
import {originalProductImage} from '../dist/pf-images.mjs';
test('documents follow explicit certification attributes and size data, not marketing text',()=>{
 const info=productDocumentMetadata({attributes:{attribute:[{productAttributeCode:'pa_certifications_environmental',attributeSetting:'FSC®,RCS'}]},items:[{item:{sizeGrid:''}}]});
 const docs=documentCandidates({modelCode:'107385',shopCategory:'kontor'},info);
 assert.deepEqual(docs.map(d=>d.id),['fsc','grs-rcs']);
 assert.deepEqual(documentCandidates({modelCode:'123',description:'FSC cotton'},{certifications:[],hasSizes:false}),[]);
 assert.equal(documentCandidates({modelCode:'R6698'},{hasSizes:true})[0].url,'https://www.pfconcept.com/pub/media/styleCard/R6698_en.pdf');
 assert.deepEqual(documentCandidates({modelCode:'../secret'},{hasSizes:true}),[]);
});
test('unavailable guides and HTML login pages never become download links',async()=>{
 const product={modelCode:'TESTSIZE'},info={hasSizes:true};
 assert.deepEqual(await listProductDocuments(product,{info,now:1,fetchImpl:async()=>new Response('',{status:404})}),[]);
 assert.deepEqual(await listProductDocuments(product,{info,now:70000,fetchImpl:async()=>new Response('<html>',{headers:{'content-type':'text/html'}})}),[]);
 assert.equal((await listProductDocuments(product,{info,now:140000,fetchImpl:async()=>new Response('',{headers:{'content-type':'application/pdf'}})}))[0].id,'size-guide');
});
test('gallery uses original PF product photos without altering placement images',()=>{
 assert.equal(originalProductImage('https://images.pfconcept.com/ProductImages_All/JPG/500x500/R66981B_M1.jpg'),'https://www.pfconcept.com/media/catalog/product/r/6/r66981b_m1.jpg');
 const placement='https://images.pfconcept.com/ImprintImages_All/JPG/500x500/example.jpg';assert.equal(originalProductImage(placement),placement);
});
