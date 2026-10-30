import test from 'node:test';
import assert from 'node:assert/strict';
import {decorationPreviewColor,isBlindEmbossing} from '../dist/decoration-preview.mjs';

test('blind embossing darkens the selected product colour and falls back to black',()=>{
 for(const impMethod of ['Prægning','Debossing','Embossing']){
  assert.equal(isBlindEmbossing({impMethod}),true);
  assert.equal(decorationPreviewColor({impMethod},{productHex:'#123456'}),'#0d243c');
  assert.equal(decorationPreviewColor({impMethod},{productHex:'#ffffff'}),'#b3b3b3');
  assert.equal(decorationPreviewColor({impMethod},{productHex:'#000000'}),'#000000');
  for(const productHex of [undefined,'blue','#bad','invalid'])assert.equal(decorationPreviewColor({impMethod},{productHex}),'#000000');
 }
});
test('foil and engraving retain their own finishes while ordinary printing keeps artwork colours',()=>{
 assert.equal(isBlindEmbossing({impMethod:'Folieprægning',impMethodCode:9}),false);
 assert.equal(decorationPreviewColor({impMethod:'Folieprægning',impMethodCode:9},{foil:'gold',productHex:'#123456'}),'#b69549');
 assert.equal(decorationPreviewColor({impMethod:'360 Gravering'},{productHex:'#123456'}),'#9e9e9e');
 assert.equal(decorationPreviewColor({impMethod:'Transfer'},{productHex:'#123456'}),null);
});
