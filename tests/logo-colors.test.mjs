import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateInkColors} from '../dist/logo-colors.mjs';

test('logo colour check ignores transparent pixels and small antialias noise',()=>{
 const pixels=[];
 for(let i=0;i<100;i++)pixels.push(...(i<30?[255,120,0,255]:i<60?[0,0,0,255]:i<90?[0,80,200,255]:i<95?[240,130,5,255]:[255,255,255,0]));
 assert.equal(estimateInkColors({data:Uint8ClampedArray.from(pixels),width:10,height:10}),3);
 assert.equal(estimateInkColors({data:Uint8ClampedArray.from([0,0,0,0]),width:1,height:1}),null);
});
