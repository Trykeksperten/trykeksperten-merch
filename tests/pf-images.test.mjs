import test from 'node:test';
import assert from 'node:assert/strict';
import {placementThumbnailImage} from '../dist/pf-images.mjs';

test('placement cards show complete front and back product photos',()=>{
 const variant={images:[
  'https://images.pfconcept.com/ProductImages_All/JPG/500x500/10717000.jpg',
  'https://images.pfconcept.com/ProductImages_All/JPG/500x500/10717000_F1.jpg',
  'https://images.pfconcept.com/ProductImages_All/JPG/500x500/10717000_B1.jpg'
 ]};
 const option={image:'https://images.pfconcept.com/ImprintImages_All/JPG/500x500/10717000_5_1954_588.jpg'};
 assert.equal(placementThumbnailImage(variant,{...option,impLocation:'Forside'}),variant.images[1]);
 assert.equal(placementThumbnailImage(variant,{...option,impLocation:'Bagside'}),variant.images[2]);
 assert.equal(placementThumbnailImage({images:[variant.images[0]]},{...option,impLocation:'Bagside'}),variant.images[0]);
});
