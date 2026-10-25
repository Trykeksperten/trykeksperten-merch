import test from 'node:test';
import assert from 'node:assert/strict';
import {createMethodReview} from '../dist/method-change-review.mjs';
const front={id:'a',impMethodCode:'PAD',impLocation:'Forside',printCode:'PAD1',impWidthMm:70,impHeightMm:7};
const back={...front,id:'b',impLocation:'Bagside'};
test('a confirmed method change requires each placement to be saved, even if old drafts exist',()=>{
 const review=createMethodReview();assert.equal(review.pending(front),false);review.require([front,back]);
 assert.equal(review.pending(front),true);assert.equal(review.pending(back),true);review.saved(front);assert.equal(review.pending(front),false);assert.equal(review.pending(back),true);
 review.saved(back);assert.equal(review.pending(back),false);
});
test('review state follows the actual print area across product colour IDs',()=>{
 const review=createMethodReview();review.require([front]);const otherColour={...front,id:'blue-front'};
 assert.equal(review.pending(otherColour),true);review.saved(otherColour);assert.equal(review.pending(front),false);
});
test('a subsequent confirmed change starts a fresh review; without print has no design review',()=>{
 const review=createMethodReview();review.require([front]);review.saved(front);review.require([front]);assert.equal(review.pending(front),true);review.require([]);assert.equal(review.pending(front),false);
});
