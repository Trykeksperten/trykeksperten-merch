import test from 'node:test';
import assert from 'node:assert/strict';
import {selectionLines,transferColourQuantities} from '../dist/product-selection.mjs';
const option={id:'black-body',impMethodCode:'PAD',impLocation:'Body',printCode:'P1',impWidthMm:70,impHeightMm:5};
const source={sku:'black-M',size:'M',options:[option]};
const target={sku:'blue-M',size:'M',options:[{...option,id:'blue-body'}]};
test('colour changes preserve saved text, ink, logo placement and quantity on matching print options',()=>{
 const design={optionId:option.id,text:'Anders',ink:'#ff0000',textPlacement:{x:.5,y:.4,scale:.3},artworks:[{id:'logo',x:.2,y:.6,logo:{id:'file'}}]};
 const [line]=selectionLines({},source,{decorations:[design]},[{variant:target,quantity:10}]);
 assert.equal(line.sku,'blue-M');assert.equal(line.quantity,10);assert.equal(line.decorations[0].optionId,'blue-body');
 assert.equal(line.decorations[0].text,'Anders');assert.equal(line.decorations[0].ink,'#ff0000');assert.deepEqual(line.decorations[0].textPlacement,design.textPlacement);assert.deepEqual(line.decorations[0].artworks,design.artworks);
 line.decorations[0].artworks[0].x=.8;assert.equal(design.artworks[0].x,.2);
});
test('incompatible print area cannot silently receive the previous design',()=>{
 assert.throws(()=>selectionLines({},source,{decorations:[{optionId:option.id}]},[{variant:{...target,options:[{...target.options[0],impWidthMm:30}]},quantity:10}]),/Trykplaceringen/);
});
test('all selected sizes retain their quantities across colours',()=>{
 assert.deepEqual(transferColourQuantities([source,{sku:'black-L',size:'L'}],{'black-M':5,'black-L':7},[target,{sku:'blue-L',size:'L'}]),{'blue-M':5,'blue-L':7});
 assert.throws(()=>transferColourQuantities([source,{sku:'black-L',size:'L'}],{'black-M':5,'black-L':7},[target]),/Størrelse L/);
});
