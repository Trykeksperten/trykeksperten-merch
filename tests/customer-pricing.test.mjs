import test from 'node:test';
import assert from 'node:assert/strict';
import {customerType,setCustomerType,fromInc,fromEx,quoteAmount,vatLabel} from '../dist/customer-pricing.mjs';
import {productPriceIntro} from '../dist/product-price-intro.mjs';
import {priceBand} from '../dist/pf-filters.mjs';
test('private and business display the same quote with the correct VAT basis without mutating it',()=>{
 const quote={net:10001,vat:2500,totalIncVat:12501};
 setCustomerType('consumer');assert.equal(customerType(),'consumer');assert.equal(quoteAmount(quote),12501);assert.equal(fromEx(10001),12501);assert.equal(vatLabel(),'inkl. moms');
 assert.match(productPriceIntro(quote,1),/125,01/);
 assert.equal(priceBand(6000),'50-100');
 setCustomerType('business');assert.equal(quoteAmount(quote),10001);assert.equal(fromInc(12501,10001),10001);assert.equal(fromEx(10001),10001);assert.equal(vatLabel(),'ekskl. moms');
 assert.match(productPriceIntro(quote,1),/100,01/);assert.equal(priceBand(6000),'under-50');
 assert.deepEqual(quote,{net:10001,vat:2500,totalIncVat:12501});
 setCustomerType('invalid');assert.equal(customerType(),'business');setCustomerType('consumer');
});
