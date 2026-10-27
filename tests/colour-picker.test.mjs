import test from 'node:test';
import assert from 'node:assert/strict';
import {hsvToHex,hexToHsv} from '../dist/colour-picker.mjs';
test('colour picker preserves RGB colours through its HSV controls',()=>{
 for(const hex of ['#000000','#ffffff','#ff0000','#00ff00','#0000ff','#ca6868','#17201f','#ffff00','#00ffff','#ff00ff'])assert.equal(hsvToHex(...hexToHsv(hex)),hex);
});

import {pantoneColour,cmykToHex,hexToCmyk,cleanTextColour} from '../dist/text-colour.mjs';
test('typed Pantone codes use the screen reference while retaining the exact requested code',()=>{
 for(const code of ['717','717c','717 C','Pantone 717 C','PMS 717 C'])assert.deepEqual(pantoneColour(code),{model:'pantone',code:'717 C',hex:'#d45d00'});
 assert.equal(pantoneColour('not-a-colour'),null);assert.equal(pantoneColour('717 U'),null);
 assert.deepEqual(cleanTextColour({model:'pantone',code:'717 C'},'#d45d00'),{model:'pantone',code:'717 C',hex:'#d45d00'});
 assert.equal(cleanTextColour({model:'pantone',code:'717 C'},'#000000'),null);
});
test('CMYK accepts percentages, preserves the original values, and rejects incomplete or invalid entries',()=>{
 assert.equal(cmykToHex([0,100,100,0]),'#ff0000');assert.equal(cmykToHex([0,0,0,100]),'#000000');assert.equal(cmykToHex([100,0,0,0]),'#00ffff');
 for(const values of [[0,'',0,0],[0,0,0,101],[-1,0,0,0],[0,0,0,NaN],['x',0,0,0],[]])assert.equal(cmykToHex(values),null);
 assert.deepEqual(hexToCmyk('#000000'),[0,0,0,100]);assert.deepEqual(hexToCmyk('#ff0000'),[0,100,100,0]);
 assert.deepEqual(cleanTextColour({model:'cmyk',values:[0,100,100,0]},'#ff0000'),{model:'cmyk',values:[0,100,100,0],hex:'#ff0000'});
 assert.equal(cleanTextColour({model:'cmyk',values:[0,100,100,0]},'#00ffff'),null);
});
