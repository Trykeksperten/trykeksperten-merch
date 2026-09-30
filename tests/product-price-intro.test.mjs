import test from 'node:test';
import assert from 'node:assert/strict';
import {productPriceIntro,printExampleQuantity} from '../dist/product-price-intro.mjs';
test('intro separates the actual undecorated quantity from the decorated example',()=>{
 const html=productPriceIntro({totalIncVat:600},1,{example:{totalIncVat:190500},exampleQuantity:100,option:{impMethod:'Tampontryk',impLocation:'Krop',maxColours:'4'}});
 assert.match(html,/6,00/);assert.match(html,/Ved 1 stk\./);assert.match(html,/19,05/);assert.match(html,/Ved 100 stk\./);assert.match(html,/1 farve/);assert.match(html,/Varepris uden tryk/);
 assert.equal(printExampleQuantity(1),100);assert.equal(printExampleQuantity(250),250);assert.equal(printExampleQuantity(undefined),100);
});
test('unavailable printing is never presented as a free or confirmed example',()=>{
 const html=productPriceIntro({totalIncVat:600},1,{example:{totalIncVat:null},exampleQuantity:100,option:{impMethod:'Tryk'},mandatory:true});
 assert.match(html,/kræver dekoration/);assert.match(html,/afventer/);assert.doesNotMatch(html,/0,00|Ved 100/);
 assert.doesNotMatch(productPriceIntro({totalIncVat:null},1),/NaN|0,00/);
});
test('engraving and full-colour examples are labelled accurately',()=>{
 const opts={example:{totalIncVat:20000},exampleQuantity:100};
 assert.doesNotMatch(productPriceIntro({totalIncVat:600},1,{...opts,option:{impMethod:'Lasergravering',impLocation:'Krop',maxColours:'1'}}),/1 farve/);
 assert.match(productPriceIntro({totalIncVat:600},1,{...opts,option:{impMethod:'Digitaltryk',impLocation:'Krop',maxColours:'Full colour'}}),/Fuldfarve/);
});
