import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeInkColors,estimateInkColors} from '../dist/logo-colors.mjs';
import {recolorPixels} from '../dist/vector-preview.mjs';

test('logo colour check ignores transparent pixels and small antialias noise',()=>{
 const pixels=[];
 for(let i=0;i<100;i++)pixels.push(...(i<30?[255,120,0,255]:i<60?[0,0,0,255]:i<90?[0,80,200,255]:i<95?[240,130,5,255]:[255,255,255,0]));
 assert.equal(estimateInkColors({data:Uint8ClampedArray.from(pixels),width:10,height:10}),3);
 assert.equal(estimateInkColors({data:Uint8ClampedArray.from([0,0,0,0]),width:1,height:1}),null);
});

test('logo colour analysis exposes each editable colour',()=>{
 const data=Uint8ClampedArray.from([...Array(50).fill([255,120,0,255]),...Array(50).fill([0,0,0,255])].flat());
 const result=analyzeInkColors({data,width:10,height:10});
 assert.equal(result.count,2);
 assert.equal(result.colors.length,2);
 assert.match(result.colors[0].hex,/^#[0-9a-f]{6}$/);
});

test('individual detected colours can be replaced independently',()=>{
 const image={data:Uint8ClampedArray.from([255,120,0,255,0,0,0,255,0,0,0,0]),width:3,height:1};
 const output=recolorPixels(image,[{source:'#ff7800',target:'#0055aa'},{source:'#000000',target:'#ffffff'}]);
 assert.deepEqual([...output.data],[0,85,170,255,255,255,255,255,0,0,0,0]);
});
