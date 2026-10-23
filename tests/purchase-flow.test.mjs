import test from 'node:test';
import assert from 'node:assert/strict';
import {hasPersonalisation,isMixedPurchase,paymentDescription} from '../dist/purchase-flow.mjs';
import {validateCheckoutConsent,LEGAL_VERSION} from '../dist/legal-consent.mjs';
import {installProductTranslations,translate} from '../dist/i18n-core.mjs';
const blank=[{decorations:[]}],decorated=[{decorations:[{text:'TEST'}]}];
const consent={version:LEGAL_VERSION,accepted:true,customerType:'consumer',locale:'da'};
test('blank purchases do not require or record personalisation or prepayment consent',()=>{
 const legal=validateCheckoutConsent({...consent,personalised:true,prepayment:true},Date.now(),{personalised:false});
 assert.equal(legal.personalised,false);assert.equal(legal.prepayment,false);assert.equal(legal.prepaymentText,'');
 assert.doesNotThrow(()=>validateCheckoutConsent(consent,Date.now(),{personalised:false}));
 assert.throws(()=>validateCheckoutConsent(consent),/personligt tilpassede/);
 assert.throws(()=>validateCheckoutConsent({...consent,accepted:false},Date.now(),{personalised:false}),/handelsbetingelser/);
});
test('payment copy reflects the actual contents of the basket in both languages',()=>{
 assert.equal(hasPersonalisation(blank),false);assert.equal(isMixedPurchase([...blank,...decorated]),true);
 assert.match(paymentDescription(blank),/tidligst ved afsendelse/);assert.doesNotMatch(paymentDescription(blank),/korrektur/);
 assert.match(paymentDescription(decorated),/tidligst ved afsendelse/);assert.match(paymentDescription(blank,'en'),/no earlier than dispatch/);
});
test('interface translations take priority over generic supplier product categories',()=>{
 installProductTranslations({Andet:'Other Pens & Writing Accessories'});
 assert.equal(translate('Andet','en'),'Other');
});

test('freight estimates never treat missing rates or unconfirmed routes as free delivery',async()=>{
 const {freightEstimate}=await import('../dist/purchase-flow.mjs');
 assert.equal(freightEstimate({ready:false,groups:[]},{}),null);
 assert.equal(freightEstimate({ready:true,groups:[{location:'PL'}]},{freightExVat:null}),null);
 assert.deepEqual(freightEstimate({ready:true,groups:[{location:'PL'}]},{freightByLocation:{PL:4000}}),{exVat:4000,incVat:5000});
 assert.equal(freightEstimate({ready:true,groups:[{location:'NL',kind:'blank'}]},{freightExVat:4000}),null);
 assert.deepEqual(freightEstimate({ready:true,groups:[{location:'NL',kind:'blank'}]},{blankShipping:{freightExVat:6000}}),{exVat:6000,incVat:7500});
});
