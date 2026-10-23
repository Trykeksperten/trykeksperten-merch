import test from 'node:test';
import assert from 'node:assert/strict';
import {highlightPFPlacementGuide,stripPFPlacementGuide,parsePFPlacementSVG} from '../lib/pf-placement.mjs';
const svg='<svg viewBox="0 0 500 500"><image href="product.jpg"/><path d="M 10 20 L 110 20 L 110 60 L 10 60 Z" style="fill:none;stroke:#00ff00;stroke-width:1"><metadata>PF</metadata></path><path d="M 1 1 L 2 2" style="stroke:#000000"></path></svg>';
test('preview retains supplier geometry and product image, changing only guide styling',()=>{
 const preview=highlightPFPlacementGuide(svg);
 assert.deepEqual(parsePFPlacementSVG(svg),{x:.02,y:.04,width:.2,height:.08,source:'svg'});
 assert.match(preview,/d="M 10 20 L 110 20 L 110 60 L 10 60 Z"/);
 assert.match(preview,/fill-opacity:0.16/);assert.match(preview,/stroke-dasharray:4 3/);
 assert.match(preview,/<image href="product.jpg"\/>/);assert.match(preview,/style="stroke:#000000"/);
 assert.doesNotMatch(preview,/#00ff00/);
 assert.doesNotMatch(stripPFPlacementGuide(svg),/M 10 20/);
});
test('missing geometry is rejected instead of drawing an invented area',()=>{
 assert.throws(()=>highlightPFPlacementGuide('<svg viewBox="0 0 500 500"><image href="product.jpg"/></svg>'));
});
