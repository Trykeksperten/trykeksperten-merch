import test from 'node:test';
import assert from 'node:assert/strict';
import {colourCountButtons} from '../dist/colour-count-buttons.mjs';
const choices=Array.from({length:12},(_,i)=>({colors:i+1,price:'44,85 kr. / stk. · opstart 625,00 kr.',priceConfirmed:true}));
test('fixed embroidery shows twelve direct choices, one selected count and one price',()=>{
 const html=colourCountButtons({id:'front',label:'Forside · antal trådfarver',choices,value:5});
 assert.equal((html.match(/<button /g)||[]).length,12);assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);assert.match(html,/data-color-count="5"[^>]+aria-pressed="true"/);assert.equal((html.match(/44,85/g)||[]).length,1);assert.match(html,/Samme pris/);assert.doesNotMatch(html,/<select/);
});
test('colour-priced print uses the selected price and never claims a fixed price',()=>{
 const html=colourCountButtons({id:'body',label:'Krop',choices:[{colors:1,price:'10 kr.',priceConfirmed:true},{colors:2,price:'15 kr.',priceConfirmed:true}],value:2});
 assert.match(html,/15 kr\./);assert.doesNotMatch(html,/Samme pris/);
});
test('unavailable counts and missing prices are explicit; labels are escaped',()=>{
 const html=colourCountButtons({id:'"x',label:'<front>',choices:[{colors:1,price:'Pris afventer'},{colors:2,price:'Pris afventer'}],value:4});
 assert.match(html,/ikke tilgængeligt/);assert.doesNotMatch(html,/Samme pris/);assert.match(html,/&lt;front&gt;/);assert.match(html,/data-color-option="&quot;x"/);
});
