import assert from 'node:assert/strict';
import test from 'node:test';
import {visibleArtworkBounds} from '../dist/vector-preview.mjs';

function artboard(width,height,background=[0,0,0,0]){
 const data=new Uint8ClampedArray(width*height*4);
 function paint(x,y,color){data.set(color,(y*width+x)*4);}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)paint(x,y,background);
 return {data,width,height,paint};
}

test('crops an Illustrator logo inside a transparent artboard',()=>{
 const board=artboard(100,80);
 for(let y=30;y<40;y++)for(let x=42;x<58;x++)board.paint(x,y,[20,20,20,255]);
 assert.deepEqual(visibleArtworkBounds(board,2),{x:40,y:28,width:20,height:14,whiteBackground:false});
});

test('ignores an opaque white artboard while retaining separate logo letters',()=>{
 const board=artboard(100,80,[255,255,255,255]);
 for(let y=30;y<40;y++)for(let x=40;x<46;x++)board.paint(x,y,[220,195,160,255]);
 for(let y=30;y<40;y++)for(let x=56;x<62;x++)board.paint(x,y,[220,195,160,255]);
 assert.deepEqual(visibleArtworkBounds(board,2),{x:38,y:28,width:26,height:14,whiteBackground:true});
});

test('keeps a colored artboard if it cannot be distinguished from the artwork',()=>{
 const board=artboard(20,10,[25,60,90,255]);
 assert.deepEqual(visibleArtworkBounds(board),{x:0,y:0,width:20,height:10,whiteBackground:false});
});

test('returns no bounds for an empty artboard',()=>{
 assert.equal(visibleArtworkBounds(artboard(20,10)),null);
});
