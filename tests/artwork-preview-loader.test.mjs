import test from 'node:test';
import assert from 'node:assert/strict';
import {createArtworkPreviewLoader,retainLocalPreviews,nextPendingPlacement} from '../dist/artwork-preview-loader.mjs';

test('a reopened server-validated cart regenerates the vector preview and shares in-flight work',async()=>{
 const original=new Blob(['%PDF-1.4'],{type:'application/pdf'}),png=new Blob(['PNG'],{type:'image/png'});let calls=0;
 const load=createArtworkPreviewLoader({loadFile:async id=>id==='original'?original:null,createVectorPreview:async file=>{assert.equal(file,original);calls++;return png;}});
 const [first,second]=await Promise.all([load({id:'original'}),load({id:'original'})]);assert.equal(first,png);assert.equal(second,png);assert.equal(calls,1);
});
test('missing cached preview falls back to the original; existing preview does not need conversion',async()=>{
 const original=new Blob(['%PDF-1.4'],{type:'application/pdf'}),png=new Blob(['PNG'],{type:'image/png'});let calls=0;
 const load=createArtworkPreviewLoader({loadFile:async id=>({original,png}[id]),createVectorPreview:async()=>{calls++;return png;}});
 assert.equal(await load({id:'original',previewId:'png'}),png);assert.equal(calls,0);
 assert.equal(await load({id:'original',previewId:'deleted'}),png);assert.equal(calls,1);
});
test('missing or failed files can be retried after recovery',async()=>{
 let available=false;const png=new Blob(['PNG'],{type:'image/png'}),load=createArtworkPreviewLoader({loadFile:async()=>available?png:null,createVectorPreview:async()=>null});
 assert.equal(await load({id:'recover'}),null);available=true;assert.equal(await load({id:'recover'}),png);
});
test('browser-only preview metadata survives cart validation without overwriting validated design values',()=>{
 const source={decorations:[{artworks:[{logo:{id:'a',previewId:'p',previewType:'image/png'}}]}]},checked={quantity:20,decorations:[{width:50,logo:{id:'a'},artworks:[{x:.5,logo:{id:'a',size:123}}]}]};
 const result=retainLocalPreviews(checked,source);assert.equal(result.decorations[0].artworks[0].logo.previewId,'p');assert.equal(result.decorations[0].logo.previewId,'p');assert.equal(result.decorations[0].width,50);assert.equal(result.decorations[0].artworks[0].logo.size,123);assert.equal(checked.decorations[0].logo.previewId,undefined);
});

test('guided saving returns to an earlier edited sleeve instead of closing before all placements are saved',()=>{
 const choices=['front','back','right','left'];
 assert.equal(nextPendingPlacement(choices,id=>id==='right',3),2);
 assert.equal(nextPendingPlacement(choices,id=>id==='left',2),3);
 assert.equal(nextPendingPlacement(choices,()=>false,3),-1);
});
