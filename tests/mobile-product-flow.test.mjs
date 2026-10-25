import test from 'node:test';
import assert from 'node:assert/strict';
import {nextMobileStep,nextRotation} from '../dist/mobile-product-flow.mjs';
import {normalizeTextPlacement} from '../dist/design-layers.mjs';
test('guided mobile flow requires quantity and a saved design, with an explicit blank-product branch',()=>{
 assert.equal(nextMobileStep('colour'),'quantity');
 assert.equal(nextMobileStep('quantity',{quantityReady:false}),'quantity');
 assert.equal(nextMobileStep('quantity',{quantityReady:true}),'method');
 assert.equal(nextMobileStep('method',{blank:false}),'design');
 assert.equal(nextMobileStep('method',{blank:true}),'summary');
 assert.equal(nextMobileStep('design',{designReady:false}),'design');
 assert.equal(nextMobileStep('design',{designReady:true}),'summary');
});
test('eight 45 degree rotations return to the starting orientation and remain in supported range',()=>{
 let angle=0;const angles=[];for(let i=0;i<8;i++){angle=nextRotation(angle);angles.push(angle);assert.ok(angle>=-180&&angle<=180);}
 assert.deepEqual(angles,[45,90,135,-180,-135,-90,-45,0]);
});
test('changing a text layer with shared size and rotation controls preserves valid print-area placement',()=>{
 const option={impWidthMm:70,impHeightMm:7};
 let placement=normalizeTextPlacement('MOTIONSDAG',{scale:.24,x:.5,y:.5},option);
 placement=normalizeTextPlacement('MOTIONSDAG',{...placement,scale:.4,rotation:nextRotation(placement.rotation)},option);
 assert.equal(placement.scale,.4);assert.equal(placement.rotation,45);assert.ok(placement.x>=0&&placement.x<=1);assert.ok(placement.y>=0&&placement.y<=1);
});
