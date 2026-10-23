import test from 'node:test';
import assert from 'node:assert/strict';
import {printMethodHelp} from '../dist/print-method-help.mjs';
test('specific techniques take precedence over generic technique names',()=>{
 assert.match(printMethodHelp('360 Gravering').short,/rundt/);
 assert.match(printMethodHelp('360 Digitaltryk').short,/rundt/);
 assert.match(printMethodHelp('Digital transfer').short,/stof/);
 assert.match(printMethodHelp('3D Broderi').short,/hævet/);
 assert.match(printMethodHelp('Gravering').detail,/ikke en valgfri/);
});
test('plain language help supports English and unknown supplier techniques',()=>{
 assert.match(printMethodHelp('Tampontryk','en').detail,/silicone/);
 assert.match(printMethodHelp('Unknown').detail,/Kontakt/);
 assert.ok(printMethodHelp('Digitaltryk').short.length<45);
});
