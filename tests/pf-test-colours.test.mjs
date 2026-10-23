import test from 'node:test';
import assert from 'node:assert/strict';
import {testColourProposal,renderTestColourChoice} from '../dist/pf-test-colours.mjs';
test('design codes, embedded spot names and nearest RGB suggestions remain distinct',()=>{
 assert.deepEqual(testColourProposal({colors:1,pmsColors:['717 C']}),{codes:['717 C'],source:'design'});
 assert.deepEqual(testColourProposal({colors:1,artworks:[{logo:{pantone:{status:'verified',codes:['186 C']}}}]}),{codes:['186 C'],source:'file'});
 const design={colors:1,artworks:[{logo:{detectedPalette:[{hex:'#ff5000'}]}}]},before=structuredClone(design);
 assert.deepEqual(testColourProposal(design),{codes:['ORANGE 021 C'],source:'suggested'});assert.deepEqual(design,before);
 assert.deepEqual(testColourProposal({colors:1,artworks:[{logo:{}}]}).codes,[]);
 assert.equal(testColourProposal({colors:2,artworks:design.artworks,text:'Hello',ink:'#000000'}).codes.length,2);
});
test('RGB suggestion is prefilled but requires confirmation; reset updates and invalidates approval',()=>{
 const previous=globalThis.document;
 const element=()=>({children:[],dataset:{},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];}});
 globalThis.document={createElement:element};
 try{
  const container=element(),input=element(),design={colors:1,artworks:[{logo:{detectedPalette:[{hex:'#ff5000'}]},color:'#dd5d05'}]};
  renderTestColourChoice(container,design,input);assert.equal(input.value,'717 C');assert.equal(input.dataset.pendingConfirmation,'1');
  container.children[1].onclick();assert.equal(input.dataset.pendingConfirmation,undefined);
  delete design.artworks[0].color;renderTestColourChoice(container,design,input);assert.equal(input.value,'ORANGE 021 C');assert.equal(input.dataset.pendingConfirmation,'1');
  input.value='186 C';input.oninput();assert.equal(input.dataset.pendingConfirmation,undefined);
  renderTestColourChoice(container,{colors:2,artworks:design.artworks},input);assert.equal(input.value,'');assert.equal(container.children.length,1);
  renderTestColourChoice(container,{colors:1,pmsColors:['717 C']},input);assert.equal(input.value,'717 C');assert.equal(input.dataset.pendingConfirmation,undefined);
 }finally{globalThis.document=previous;}
});
