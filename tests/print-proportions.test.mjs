import test from 'node:test';
import assert from 'node:assert/strict';
import {proportionalPrintBounds,artworkPrintSize} from '../dist/design-layers.mjs';
test('narrow pen print bounds preserve artwork aspect in square and rectangular previews',()=>{
 const option={impWidthMm:70,impHeightMm:7},bounds={x:.2,y:.45,width:.6,height:.04};
 for(const [cw,ch] of [[1024,1024],[700,500],[360,360]]){
  const zone=proportionalPrintBounds(bounds,option,cw,ch);
  const art=artworkPrintSize({logo:{pixelWidth:1000,pixelHeight:100},scale:1},option);
  const renderedAspect=zone.width*cw*art.widthFraction/(zone.height*ch*art.heightFraction);
  assert.ok(Math.abs(renderedAspect-10)<1e-8);
  assert.ok(zone.width<=bounds.width+1e-8&&zone.height<=bounds.height+1e-8);
  assert.ok(Math.abs(zone.x+zone.width/2-(bounds.x+bounds.width/2))<1e-8);
  assert.ok(Math.abs(zone.y+zone.height/2-(bounds.y+bounds.height/2))<1e-8);
 }
});
