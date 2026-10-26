import test from 'node:test';
import assert from 'node:assert/strict';
import {hsvToHex,hexToHsv} from '../dist/colour-picker.mjs';
test('colour picker preserves RGB colours through its HSV controls',()=>{
 for(const hex of ['#000000','#ffffff','#ff0000','#00ff00','#0000ff','#ca6868','#17201f','#ffff00','#00ffff','#ff00ff'])assert.equal(hsvToHex(...hexToHsv(hex)),hex);
});
